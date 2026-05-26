/**
 * scripts/categorize-casks.ts — One-time ML categorization job for BrewIndex
 *
 * Uses AWS Bedrock (Claude 3.5 Haiku) to assign categories to all active casks
 * that do not yet have a category. Updates casks.category in the database and
 * invalidates the ISR cache via revalidateTag('casks').
 *
 * Usage: npx tsx scripts/categorize-casks.ts
 *
 * Prerequisites:
 *   - DATABASE_URL must be set in .env.local (or environment)
 *   - AWS_REGION must be set (e.g. us-east-1)
 *   - AWS_ACCESS_KEY_ID must be set
 *   - AWS_SECRET_ACCESS_KEY must be set
 *   - IAM user/role must have bedrock:InvokeModel permission for Claude models
 *
 * Cost estimate:
 *   ~7,659 casks × ~500 tokens avg = ~3.8M tokens input
 *   On-demand pricing: $8/1M input tokens = ~$30 total (one-time run)
 *   Use batch inference (InvokeBatchCommand) if cost becomes a concern — 50% cheaper.
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema';
import { eq, isNull, and } from 'drizzle-orm';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { revalidateTag } from 'next/cache';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BEDROCK_MODEL = 'anthropic.claude-3-5-haiku-20241022-v1:0';
const UPDATE_BATCH_SIZE = 100; // Flush DB updates every N categorizations

// Predefined category list for consistent taxonomy (per D-02: model decides,
// but we provide a fixed set to prevent taxonomy drift across parallel invocations).
const CATEGORIES = [
  'Developer Tools',
  'Productivity',
  'Design & Graphics',
  'Media & Entertainment',
  'Utilities',
  'Communication',
  'Business',
  'Education',
  'Games',
  'Other',
] as const;

type Category = (typeof CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Credential check
// ---------------------------------------------------------------------------

function checkCredentials(): boolean {
  const required = ['DATABASE_URL', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
  const missing = required.filter((k) => !process.env[k]);

  if (missing.length > 0) {
    console.error('ERROR: Missing required environment variables:');
    for (const key of missing) {
      console.error(`  ${key}`);
    }
    console.error('\nSet these in .env.local (for local runs) or in your deployment environment:');
    console.error('  DATABASE_URL=<your-postgres-connection-string>');
    console.error('  AWS_REGION=us-east-1');
    console.error('  AWS_ACCESS_KEY_ID=<your-access-key>');
    console.error('  AWS_SECRET_ACCESS_KEY=<your-secret-key>');
    console.error('\nMake sure your IAM user/role has bedrock:InvokeModel permission.');
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Bedrock categorization
// ---------------------------------------------------------------------------

/**
 * Ask Claude 3.5 Haiku to categorize a single cask into one of the predefined categories.
 * Returns the matched category string, or 'Other' if the response cannot be parsed.
 */
async function categorizeCask(
  client: BedrockRuntimeClient,
  name: string,
  description: string | null,
): Promise<Category> {
  const prompt =
    `Categorize this macOS application into exactly one of these categories: ` +
    `${CATEGORIES.join(', ')}. ` +
    `Return ONLY the category name, nothing else.\n\n` +
    `App: ${name}\n` +
    `Description: ${description ?? 'No description available.'}`;

  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 50,
    messages: [{ role: 'user', content: prompt }],
  });

  const response = await client.send(
    new InvokeModelCommand({
      modelId: BEDROCK_MODEL,
      contentType: 'application/json',
      accept: 'application/json',
      body: Buffer.from(body),
    }),
  );

  // Parse the Bedrock response body
  const responseBody = JSON.parse(Buffer.from(response.body).toString('utf-8')) as {
    content: Array<{ type: string; text: string }>;
  };

  const rawText = responseBody.content[0]?.text?.trim() ?? '';

  // Match the response to one of our known categories (case-insensitive)
  const matched = CATEGORIES.find(
    (cat) => cat.toLowerCase() === rawText.toLowerCase(),
  );

  return matched ?? 'Other';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== BrewIndex Cask Categorization (AWS Bedrock) ===\n');

  // Step 0: Check all required credentials before doing any work
  if (!checkCredentials()) {
    process.exit(1);
  }

  // Step 1: Set up database connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 2,
  });
  const db = drizzle({ client: pool, schema });

  // Step 2: Set up Bedrock client
  const bedrockClient = new BedrockRuntimeClient({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  try {
    // Step 3: Fetch all active casks that have no category assigned yet
    console.log('Fetching uncategorized casks...');
    const uncategorized = await db
      .select({
        id: schema.casks.id,
        token: schema.casks.token,
        name: schema.casks.name,
        description: schema.casks.description,
      })
      .from(schema.casks)
      .where(and(eq(schema.casks.is_active, true), isNull(schema.casks.category)));

    console.log(`Found ${uncategorized.length} casks to categorize.\n`);

    if (uncategorized.length === 0) {
      console.log('All active casks are already categorized. Nothing to do.');
      await pool.end();
      process.exit(0);
    }

    // Step 4: Categorize each cask and batch-update the database
    let successCount = 0;
    let failureCount = 0;
    const pendingUpdates: Array<{ id: number; category: Category }> = [];

    for (let i = 0; i < uncategorized.length; i++) {
      const cask = uncategorized[i];

      try {
        const category = await categorizeCask(bedrockClient, cask.name, cask.description);
        pendingUpdates.push({ id: cask.id, category });
        successCount++;
      } catch (err) {
        console.error(`  [FAIL] ${cask.token}: ${String(err)}`);
        failureCount++;
      }

      // Step 5: Flush DB updates every UPDATE_BATCH_SIZE categorizations
      if (pendingUpdates.length >= UPDATE_BATCH_SIZE) {
        process.stdout.write(
          `  Progress: ${i + 1}/${uncategorized.length} processed — flushing ${pendingUpdates.length} updates to DB...\n`,
        );
        await flushUpdates(db, pendingUpdates);
        pendingUpdates.length = 0; // Clear the pending array
      }
    }

    // Flush any remaining updates
    if (pendingUpdates.length > 0) {
      console.log(
        `  Flushing final ${pendingUpdates.length} updates to DB...`,
      );
      await flushUpdates(db, pendingUpdates);
    }

    console.log(`\nCategorization complete:`);
    console.log(`  Successfully categorized: ${successCount} casks`);
    console.log(`  Failed: ${failureCount} casks`);

    // Step 6: Invalidate ISR cache so the browse page picks up new categories
    console.log('\nInvalidating ISR cache (revalidateTag("casks"))...');
    revalidateTag('casks', 'max');
    console.log('ISR cache invalidated.');
  } catch (err) {
    console.error('\nFATAL ERROR during categorization:', err);
    await pool.end();
    process.exit(1);
  }

  await pool.end();
  console.log('\nDone. Run the following to verify category distribution:');
  console.log(
    '  SELECT category, COUNT(*) FROM casks WHERE is_active = true GROUP BY category ORDER BY COUNT(*) DESC;',
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Write a batch of category assignments to the database.
 * Uses sequential individual updates (Drizzle lacks bulk-update-with-different-values support).
 */
async function flushUpdates(
  db: ReturnType<typeof drizzle<typeof schema>>,
  updates: Array<{ id: number; category: Category }>,
) {
  for (const { id, category } of updates) {
    await db
      .update(schema.casks)
      .set({ category })
      .where(eq(schema.casks.id, id));
  }
}

main();
