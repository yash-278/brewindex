/**
 * scripts/categorize-casks.ts — One-time ML categorization job for BrewIndex
 *
 * Uses AWS Bedrock (Amazon Nova Micro) to assign categories to all active casks
 * that do not yet have a category. Updates casks.category in the database and
 * invalidates the ISR cache via revalidateTag('casks').
 *
 * Usage: npx tsx scripts/categorize-casks.ts
 *   Or with a named SSO profile: AWS_PROFILE=my-sso-profile npx tsx scripts/categorize-casks.ts
 *
 * Prerequisites:
 *   - DATABASE_URL must be set in .env.local (or environment)
 *   - AWS_REGION must be set (e.g. us-east-1)
 *   - AWS_PROFILE must be set to your SSO profile name (e.g. my-profile)
 *     OR AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY set for static credentials
 *   - Profile must have bedrock:InvokeModel permission for amazon.nova-micro-v1:0
 *   - Run `aws sso login --profile <profile>` before executing if SSO session is expired
 *
 * Cost estimate (Amazon Nova Micro):
 *   ~7,659 casks × ~500 input tokens avg = ~3.8M input tokens → $0.035/1M = ~$0.13
 *   ~7,659 casks × ~10 output tokens avg = ~0.08M output tokens → $0.14/1M = ~$0.01
 *   Total: ~$0.14 (vs ~$3 for Claude 3.5 Haiku — 20× cheaper for this classification task)
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
import { fromSSO } from '@aws-sdk/credential-providers';
import { revalidateTag } from 'next/cache';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BEDROCK_MODEL = 'amazon.nova-micro-v1:0';
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
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!process.env.AWS_REGION) missing.push('AWS_REGION');

  // Require either SSO profile OR static access key credentials
  const hasProfile = Boolean(process.env.AWS_PROFILE);
  const hasStaticCreds = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

  if (missing.length > 0) {
    console.error('ERROR: Missing required environment variables:');
    for (const key of missing) {
      console.error(`  ${key}`);
    }
    console.error('\nSet these in .env.local (for local runs):');
    console.error('  DATABASE_URL=<your-postgres-connection-string>');
    console.error('  AWS_REGION=us-east-1');
    return false;
  }

  if (!hasProfile && !hasStaticCreds) {
    console.error('ERROR: No AWS credentials found.');
    console.error('\nOption 1 — SSO profile (recommended for local runs):');
    console.error('  AWS_PROFILE=my-sso-profile npx tsx scripts/categorize-casks.ts');
    console.error('  (run `aws sso login --profile my-sso-profile` first if session expired)');
    console.error('\nOption 2 — Static credentials:');
    console.error('  AWS_ACCESS_KEY_ID=<key> AWS_SECRET_ACCESS_KEY=<secret> npx tsx scripts/categorize-casks.ts');
    console.error('\nMake sure your IAM user/role has bedrock:InvokeModel permission for amazon.nova-micro-v1:0');
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Bedrock categorization
// ---------------------------------------------------------------------------

/**
 * Ask Nova Micro to categorize a single cask into one of the predefined categories.
 * Returns the matched category string, or 'Other' if the response cannot be parsed.
 *
 * Nova Micro request format differs from Anthropic:
 *   - No `anthropic_version` field
 *   - Uses `inferenceConfig.maxTokens` (not `max_tokens`)
 *   - Content is an array of { text: string } objects (not plain string)
 *   - Response: { output: { message: { content: [{ text: string }] } } }
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
    messages: [
      {
        role: 'user',
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens: 20,
      temperature: 0.1, // Low temperature for consistent classification
    },
  });

  const response = await client.send(
    new InvokeModelCommand({
      modelId: BEDROCK_MODEL,
      contentType: 'application/json',
      accept: 'application/json',
      body: Buffer.from(body),
    }),
  );

  // Nova Micro response structure: { output: { message: { content: [{ text: string }] } } }
  const responseBody = JSON.parse(Buffer.from(response.body).toString('utf-8')) as {
    output: { message: { content: Array<{ text: string }> } };
  };

  const rawText = responseBody.output?.message?.content?.[0]?.text?.trim() ?? '';

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

  // Step 2: Set up Bedrock client — prefer SSO profile over static credentials
  const bedrockClient = new BedrockRuntimeClient({
    region: process.env.AWS_REGION!,
    ...(process.env.AWS_PROFILE
      ? {
          credentials: fromSSO({ profile: process.env.AWS_PROFILE }),
        }
      : {
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          },
        }),
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
