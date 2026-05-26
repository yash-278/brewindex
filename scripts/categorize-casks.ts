/**
 * scripts/categorize-casks.ts — One-time ML categorization job for BrewIndex
 *
 * Uses AWS Bedrock (Amazon Nova Micro) to assign categories to all active casks
 * that do not yet have a category. Updates casks.category in the database and
 * invalidates the ISR cache via revalidateTag('casks').
 *
 * Execution model: casks are processed in parallel batches of CONCURRENCY (20).
 * All 20 Bedrock calls in a batch fire simultaneously; results are flushed to the
 * DB after each batch completes. This gives ~20× throughput over sequential execution.
 *
 * Usage:
 *   AWS_PROFILE=my-sso-profile npx tsx scripts/categorize-casks.ts
 *   npx tsx scripts/categorize-casks.ts   (uses static key/secret from env)
 *
 * Prerequisites:
 *   - DATABASE_URL set in .env.local (or environment)
 *   - AWS_REGION set (e.g. us-east-1)
 *   - AWS_PROFILE set to your SSO profile name
 *     OR AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY set for static credentials
 *   - IAM user/role must have bedrock:InvokeModel on amazon.nova-micro-v1:0
 *   - Run `aws sso login --profile <profile>` first if SSO session is expired
 *
 * Cost estimate (Amazon Nova Micro, on-demand):
 *   ~7,659 casks × ~500 input tokens avg  = ~3.8M input  → $0.035/1M = ~$0.13
 *   ~7,659 casks × ~10  output tokens avg = ~0.08M output → $0.14/1M  = ~$0.01
 *   Total: ~$0.14  (vs ~$3 for Claude 3.5 Haiku — 20× cheaper for fixed-label classification)
 *
 * Runtime estimate at 20 parallel calls:
 *   ~7,659 casks / 20 concurrency = ~383 batches × ~1s/batch = ~6–7 minutes
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { fromSSO } from "@aws-sdk/credential-providers";
import "dotenv/config";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { revalidateTag } from "next/cache";
import { Pool } from "pg";
import * as schema from "../src/db/schema";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BEDROCK_MODEL = "amazon.nova-micro-v1:0";
const CONCURRENCY = 20; // Bedrock calls fired in parallel per batch

// Predefined category list for consistent taxonomy (per D-02: we provide a fixed
// set to prevent taxonomy drift across parallel invocations).
const CATEGORIES = [
  "Developer Tools",
  "Productivity",
  "Design & Graphics",
  "Media & Entertainment",
  "Utilities",
  "Communication",
  "Business",
  "Education",
  "Games",
  "Other",
] as const;

type Category = (typeof CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Credential check
// ---------------------------------------------------------------------------

function checkCredentials(): boolean {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");

  if (missing.length > 0) {
    console.error("ERROR: Missing required environment variables:");
    for (const key of missing) console.error(`  ${key}`);
    console.error("\nSet these in .env.local (for local runs):");
    console.error("  DATABASE_URL=<your-postgres-connection-string>");
    return false;
  }

  const hasProfile = Boolean(process.env.AWS_PROFILE);
  const hasStaticCreds = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

  if (!hasProfile && !hasStaticCreds) {
    console.error("ERROR: No AWS credentials found.");
    console.error("\nOption 1 — SSO profile (recommended for local runs):");
    console.error("  AWS_PROFILE=my-sso-profile npx tsx scripts/categorize-casks.ts");
    console.error("  (run `aws sso login --profile my-sso-profile` first if session is expired)");
    console.error("\nOption 2 — Static credentials:");
    console.error("  AWS_ACCESS_KEY_ID=<key> AWS_SECRET_ACCESS_KEY=<secret> npx tsx scripts/categorize-casks.ts");
    console.error("\nIAM permission required: bedrock:InvokeModel for amazon.nova-micro-v1:0");
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Bedrock categorization (single call)
// ---------------------------------------------------------------------------

/**
 * Ask Nova Micro to categorize a single cask.
 * Returns the matched Category string, or 'Other' if the response cannot be parsed.
 *
 * Nova Micro request format (differs from Anthropic):
 *   - No `anthropic_version` field
 *   - inferenceConfig.maxTokens  (not max_tokens)
 *   - content is an array of { text: string } objects
 *   - response: { output: { message: { content: [{ text: string }] } } }
 */
async function categorizeCask(
  client: BedrockRuntimeClient,
  name: string,
  description: string | null,
): Promise<Category> {
  const prompt =
    `Categorize this macOS application into exactly one of these categories: ` +
    `${CATEGORIES.join(", ")}. ` +
    `Return ONLY the category name, nothing else.\n\n` +
    `App: ${name}\n` +
    `Description: ${description ?? "No description available."}`;

  const body = JSON.stringify({
    messages: [{ role: "user", content: [{ text: prompt }] }],
    inferenceConfig: {
      maxTokens: 20,
      temperature: 0.1, // low temperature → consistent single-label output
    },
  });

  const response = await client.send(
    new InvokeModelCommand({
      modelId: BEDROCK_MODEL,
      contentType: "application/json",
      accept: "application/json",
      body: Buffer.from(body),
    }),
  );

  const responseBody = JSON.parse(Buffer.from(response.body).toString("utf-8")) as {
    output: { message: { content: Array<{ text: string }> } };
  };

  const rawText = responseBody.output?.message?.content?.[0]?.text?.trim() ?? "";
  const matched = CATEGORIES.find((cat) => cat.toLowerCase() === rawText.toLowerCase());
  return matched ?? "Other";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Slice an array into chunks of at most `size` elements. */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Flush a batch of category assignments to the database.
 * Sequential individual updates — Drizzle doesn't support bulk UPDATE with different
 * values per row, so we run them one at a time inside a single async call.
 */
async function flushUpdates(
  db: ReturnType<typeof drizzle<typeof schema>>,
  updates: Array<{ id: number; category: Category }>,
): Promise<void> {
  for (const { id, category } of updates) {
    await db.update(schema.casks).set({ category }).where(eq(schema.casks.id, id));
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== BrewIndex Cask Categorization (AWS Bedrock / Nova Micro) ===\n");

  if (!checkCredentials()) process.exit(1);

  // Database connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    max: 5, // slightly larger pool to support parallel DB flushes without queuing
  });
  const db = drizzle({ client: pool, schema });

  // Bedrock client — SSO profile takes precedence over static creds
  const bedrockClient = new BedrockRuntimeClient({
    region: "us-east-1",
    ...(process.env.AWS_PROFILE
      ? { credentials: fromSSO({ profile: process.env.AWS_PROFILE }) }
      : {
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          },
        }),
  });

  try {
    // Fetch all active casks without a category
    console.log("Fetching uncategorized casks...");
    const uncategorized = await db
      .select({
        id: schema.casks.id,
        token: schema.casks.token,
        name: schema.casks.name,
        description: schema.casks.description,
      })
      .from(schema.casks)
      .where(and(eq(schema.casks.is_active, true), isNull(schema.casks.category)));

    const total = uncategorized.length;
    console.log(`Found ${total} casks to categorize.`);

    if (total === 0) {
      console.log("All active casks are already categorized. Nothing to do.");
      await pool.end();
      process.exit(0);
    }

    const batches = chunkArray(uncategorized, CONCURRENCY);
    console.log(`Processing in ${batches.length} batches of up to ${CONCURRENCY} parallel calls.\n`);

    let successCount = 0;
    let failureCount = 0;
    let processed = 0;

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      const batchLabel = `Batch ${String(batchIdx + 1).padStart(3, " ")}/${batches.length}`;

      console.log(`${batchLabel} — starting ${batch.length} parallel calls...`);
      const batchStart = Date.now();

      // Fire all CONCURRENCY Bedrock calls simultaneously, logging each dispatch
      const results = await Promise.allSettled(
        batch.map((cask) => {
          process.stdout.write(`  → dispatching ${cask.token}\n`);
          return categorizeCask(bedrockClient, cask.name, cask.description);
        }),
      );

      const batchMs = Date.now() - batchStart;

      // Log each result and collect successful ones for DB flush
      const updates: Array<{ id: number; category: Category }> = [];

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const cask = batch[i];

        if (result.status === "fulfilled") {
          process.stdout.write(`  ✓ ${cask.token.padEnd(40)} → ${result.value}\n`);
          updates.push({ id: cask.id, category: result.value });
          successCount++;
        } else {
          process.stdout.write(`  ✗ ${cask.token.padEnd(40)} → FAILED: ${String(result.reason)}\n`);
          failureCount++;
        }
      }

      // Flush this batch's results to DB before moving on
      if (updates.length > 0) {
        process.stdout.write(`  Flushing ${updates.length} results to DB...`);
        await flushUpdates(db, updates);
        process.stdout.write(` done.\n`);
      }

      processed += batch.length;
      const pct = Math.round((processed / total) * 100);
      console.log(`${batchLabel} — done in ${batchMs}ms | ${processed}/${total} (${pct}%) | ok: ${successCount} fail: ${failureCount}\n`);
    }

    console.log(`\nCategorization complete:`);
    console.log(`  Successfully categorized: ${successCount}`);
    console.log(`  Failed:                   ${failureCount}`);

    // Invalidate ISR cache so the browse page picks up the new categories
    console.log('\nInvalidating ISR cache (revalidateTag("casks"))...');
    revalidateTag("casks", "max");
    console.log("ISR cache invalidated.");
  } catch (err) {
    console.error("\nFATAL ERROR during categorization:", err);
    await pool.end();
    process.exit(1);
  }

  await pool.end();
  console.log("\nDone. Verify category distribution:");
  console.log("  SELECT category, COUNT(*) FROM casks WHERE is_active = true GROUP BY category ORDER BY COUNT(*) DESC;");
  process.exit(0);
}

main();
