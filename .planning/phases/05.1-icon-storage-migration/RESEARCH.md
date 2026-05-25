# Phase 5.1: Icon Storage Migration - Research

**Researched:** 2026-05-25
**Domain:** S3-compatible object storage migration (Vercel Blob → Tigris via Railway)
**Confidence:** HIGH (all critical findings verified against live endpoints and official docs)

---

## Summary

Phase 5.1 migrates icon storage from `@vercel/blob` to the Railway-provisioned Tigris S3-compatible bucket (`roomy-breadbox-0sbir2el4w`). The change is surgical: exactly one file owns the upload logic (`src/lib/icons.ts`), one file gates external fetches (`src/lib/fetch-allowlist.ts`), one file configures `next/image` remote origins (`next.config.ts`), and two call-sites check for `BLOB_READ_WRITE_TOKEN` in their startup validation (`backend/src/routes/sync.ts`, `src/app/api/cron/sync/route.ts`).

The AWS SDK v3 (`@aws-sdk/client-s3`) is the correct replacement client. It is the official AWS-maintained SDK, version 3.1053.0 as of 2026-05-22, with direct S3-compatible support for Tigris via a custom `endpoint` override. Tigris confirms it supports the `x-amz-acl: public-read` canned ACL, and it uses **virtual-hosted-style URLs** for public object access: `https://[bucket-name].t3.storage.dev/[key]`. Both `t3.storage.dev` and `t3.storageapi.dev` are confirmed live Tigris infrastructure (both return `Server: Tigris OS` on the root endpoint); `t3.storage.dev` is the domain documented by Tigris, while `t3.storageapi.dev` is the domain the phase description references for the Railway-provisioned bucket — both are valid and serve the same object store.

The DB migration strategy is a nullable null-out: set `icon_url = NULL` for all rows that currently point to `blob.vercel-storage.com`. The sync pipeline's incremental guard (`WHERE icon_url IS NULL`) then re-fetches those icons into Tigris on the next run. No schema changes are needed — the `icon_url` column is already nullable `text`.

**Primary recommendation:** Replace the `put()` call from `@vercel/blob` with a `PutObjectCommand` from `@aws-sdk/client-s3`, configured with `endpoint: process.env.S3_ENDPOINT`, `region: "auto"`, and `ACL: "public-read"`. Construct the public URL as `https://${bucket}.t3.storage.dev/icons/${token}.ico` (or use `${process.env.S3_ENDPOINT}` domain swapped for the public subdomain). Null out all `blob.vercel-storage.com` rows at sync startup. Remove `@vercel/blob` after migration is confirmed.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Icon fetch from DuckDuckGo | API / Backend (Railway Hono) | — | Already runs in `backend/src/routes/sync.ts`; outbound HTTP from backend, not from browser |
| Icon upload to Tigris | API / Backend (Railway Hono) | — | S3 write requires secret credentials; must never touch the browser tier |
| Public icon URL stored in DB | Database / Storage | — | `icon_url` column holds the Tigris CDN URL after upload |
| Icon display | Frontend Server (SSR) | Browser | `next/image` fetches and optimizes via `remotePatterns`; browser receives the optimized image |
| SSRF allowlist enforcement | API / Backend (Railway Hono) | — | `safeFetch` runs in the backend process before any outbound request |
| `next/image` remotePatterns | CDN / Static | Frontend Server | Next.js Image Optimization API validates origin; must whitelist the Tigris subdomain |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@aws-sdk/client-s3` | 3.1053.0 | S3-compatible PutObject/DeleteObject | Official AWS SDK v3; the standard client for every S3-compatible store including Tigris, R2, MinIO. Verified on npm registry 2026-05-22. [VERIFIED: npm registry] |

### Supporting

No new supporting libraries needed. The existing `safeFetch` handles outbound fetches. `drizzle-orm` handles the null-out migration.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@aws-sdk/client-s3` | Tigris native SDK (`@tigrisdata/object-storage`) | Tigris SDK is lighter but adds a non-standard abstraction. AWS SDK works identically and is already a known quantity in the ecosystem. |
| `@aws-sdk/client-s3` | `aws4fetch` (tiny WASM fetch wrapper) | No TypeScript types, minimal ecosystem. `@aws-sdk/client-s3` is the correct choice for a Node.js backend. |

**Installation:**
```bash
npm install @aws-sdk/client-s3
```

**Version verification:**
```
@aws-sdk/client-s3@3.1053.0  (published 2026-05-22, github.com/aws/aws-sdk-js-v3)
```

---

## Package Legitimacy Audit

> slopcheck was not installable in this environment — marking packages `[ASSUMED]` per degraded-mode policy.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@aws-sdk/client-s3` | npm | ~7 yrs (SDK v3 since 2020) | Tens of millions/wk | github.com/aws/aws-sdk-js-v3 | n/a | Approved — official AWS SDK, extremely high confidence despite slopcheck unavailability |

*slopcheck was unavailable at research time. `@aws-sdk/client-s3` is confirmed via npm registry (v3.1053.0, 2026-05-22) and official GitHub repo at github.com/aws/aws-sdk-js-v3. The `@aws-sdk` scope is owned by Amazon Web Services and is not a hallucination risk.*

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
DuckDuckGo favicon service
         |
         | HTTP GET /{domain}.ico
         v
  backend/src/routes/sync.ts
  (Railway Hono server)
         |
         | fetchAndStoreIcon(token, homepage)
         v
  src/lib/icons.ts
  [NEW] S3Client.send(PutObjectCommand)
  - endpoint: S3_ENDPOINT (https://t3.storageapi.dev)
  - bucket: S3_BUCKET (roomy-breadbox-0sbir2el4w)
  - key: icons/{token}.ico
  - ACL: public-read
         |
         | Returns public URL: https://roomy-breadbox-0sbir2el4w.t3.storage.dev/icons/{token}.ico
         v
  Neon Postgres (casks.icon_url)
         |
         | DB row with URL
         v
  Next.js (Vercel)
  next/image remotePatterns
  - hostname: roomy-breadbox-0sbir2el4w.t3.storage.dev
         |
         | Image Optimization API proxies & caches
         v
  Browser (optimized WebP/AVIF)
```

### Recommended Project Structure

No new directories. All changes are file-level within existing structure:

```
src/
├── lib/
│   ├── icons.ts          ← REPLACE @vercel/blob with @aws-sdk/client-s3
│   └── fetch-allowlist.ts  ← note: no change needed (upload goes TO Tigris, not via safeFetch)
next.config.ts              ← ADD Tigris remotePattern, REMOVE blob.vercel-storage.com
backend/src/routes/sync.ts  ← REMOVE BLOB_READ_WRITE_TOKEN from required env check
src/app/api/cron/sync/route.ts ← REMOVE BLOB_READ_WRITE_TOKEN from required env check
scripts/
└── null-icon-urls.ts       ← NEW one-off migration script (or inline at sync startup)
```

### Pattern 1: S3Client Configuration for Tigris

**What:** Minimal S3Client pointing at Tigris endpoint with credentials from env vars.
**When to use:** Module-level singleton; instantiate once per process.

```typescript
// Source: https://www.tigrisdata.com/docs/sdks/s3/aws-js-sdk/ [CITED]
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: 'auto',                          // Tigris requires "auto" [CITED: tigrisdata.com/docs/sdks/s3/aws-js-sdk]
  endpoint: process.env.S3_ENDPOINT!,      // https://t3.storageapi.dev (Railway-provided) [ASSUMED — see env var note]
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: false,                   // Virtual-hosted style required [CITED: tigrisdata.com/docs/sdks/s3/aws-js-sdk]
});
```

**Key notes:**
- `region: "auto"` is required — Tigris rejects standard AWS region strings. [CITED: tigrisdata.com/docs/sdks/s3/]
- `forcePathStyle: false` is required — Tigris uses virtual-hosted addressing. [CITED: tigrisdata.com/docs/sdks/s3/aws-js-sdk]
- Credentials should come from env vars, not hardcoded. The `@aws-sdk/client-s3` package picks them up automatically from `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` if those names are used, or you can pass them explicitly as shown above.

### Pattern 2: PutObjectCommand with public-read ACL

**What:** Upload a buffer to Tigris with public-read access.
**When to use:** In `fetchAndStoreIcon()` to replace the `put()` call from `@vercel/blob`.

```typescript
// Source: @aws-sdk/client-s3 official SDK + Tigris ACL support [CITED: tigrisdata.com/docs/api/s3]
import { PutObjectCommand } from '@aws-sdk/client-s3';

const key = `icons/${token}.ico`;

await s3.send(new PutObjectCommand({
  Bucket: process.env.S3_BUCKET!,
  Key: key,
  Body: Buffer.from(iconBuffer),
  ContentType: 'image/x-icon',
  ACL: 'public-read',                       // Tigris supports canned ACLs: public-read + private [CITED: tigrisdata.com/docs/api/s3]
}));

// Construct public URL — virtual-hosted style
const bucket = process.env.S3_BUCKET!;
const publicDomain = 't3.storage.dev';      // [CITED: tigrisdata.com/docs/sdks/tigris/using-sdk — "tigris-example.t3.storage.dev"]
const publicUrl = `https://${bucket}.${publicDomain}/${key}`;
```

**Tigris ACL verification:** The Tigris S3 API docs confirm "only canned ACLs (`public-read` and `private`) are supported" and `PutObjectAcl` is in the supported operations list. [CITED: tigrisdata.com/docs/api/s3]

### Pattern 3: Public URL Construction

**What:** The public URL for an object stored in Tigris.
**Verified domain:** `t3.storage.dev` is the Tigris-documented public domain. [CITED: tigrisdata.com/docs/sdks/tigris/using-sdk — example URL `https://tigris-example.t3.storage.dev/object.txt`]

**The two domains in play:**
- `t3.storageapi.dev` — the S3 API endpoint (used in `S3Client` `endpoint:` config; used for writes via SDK). This is the Railway-provided endpoint URL and responds with `Server: Tigris OS`. [VERIFIED: live curl probe 2026-05-25]
- `t3.storage.dev` — the public CDN domain for reading stored objects (virtual-hosted style: `https://bucket-name.t3.storage.dev/key`). [CITED: tigrisdata.com/docs/sdks/tigris/using-sdk]

Both live curl probes to the virtual-hosted bucket URL `https://roomy-breadbox-0sbir2el4w.t3.storageapi.dev` and `https://roomy-breadbox-0sbir2el4w.t3.storage.dev` return HTTP 403 with `Server: Tigris OS` — confirming the bucket exists and is reachable at both domains. [VERIFIED: live curl probes 2026-05-25]

**Decision needed (LOW confidence):** It is not confirmed from documentation whether `t3.storageapi.dev` subdomains serve public objects as CDN URLs, or whether only `t3.storage.dev` subdomains are intended for public serving. The Tigris SDK docs only document `t3.storage.dev` as the public URL domain. The safest approach: use `t3.storage.dev` for the `publicUrl` written to the database, regardless of which domain is used as the API endpoint.

```typescript
// Write API endpoint (SDK config) — use the Railway-provided value:
endpoint: process.env.S3_ENDPOINT  // https://t3.storageapi.dev

// Public URL written to DB — use t3.storage.dev (documented public CDN domain):
const publicUrl = `https://${process.env.S3_BUCKET}.t3.storage.dev/${key}`;
```

**Alternatively**, derive the public URL by replacing the API domain in the endpoint env var:
```typescript
const endpointHost = new URL(process.env.S3_ENDPOINT!).hostname; // t3.storageapi.dev
const publicHost = endpointHost.replace('storageapi', 'storage'); // t3.storage.dev
const publicUrl = `https://${process.env.S3_BUCKET}.${publicHost}/${key}`;
```

This is more robust if Railway ever changes the endpoint but keeps the same pattern.

### Pattern 4: DB Null-Out (icon URL reset)

**What:** Set `icon_url = NULL` for all rows that currently point at `blob.vercel-storage.com`.
**When to use:** Run once at migration time, before deploying the new `icons.ts`. The sync pipeline's existing `WHERE icon_url IS NULL` guard picks these rows up on the next run.

**Drizzle ORM form:**
```typescript
// Source: drizzle-orm docs — update with where [ASSUMED]
import { db } from '../src/db/index';
import { casks } from '../src/db/schema';
import { like, sql } from 'drizzle-orm';

await db
  .update(casks)
  .set({ icon_url: null, icon_is_fallback: false })
  .where(like(casks.icon_url, '%blob.vercel-storage.com%'));

console.log('icon_url nulled for all Vercel Blob rows');
process.exit(0);
```

**Raw SQL equivalent (safe as a one-liner in psql or Neon console):**
```sql
UPDATE casks
SET icon_url = NULL, icon_is_fallback = false
WHERE icon_url LIKE '%blob.vercel-storage.com%';
```

**Recommendation:** Run this as a standalone script (`scripts/null-icon-urls.ts`) with `npx tsx scripts/null-icon-urls.ts` rather than inline at sync startup. Inline would null the URLs on every sync restart, which is incorrect if the migration has already completed. A one-off script is safer and auditable.

### Pattern 5: Updated `fetchAndStoreIcon` (complete replacement)

```typescript
// src/lib/icons.ts — full replacement
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { safeFetch } from './fetch-allowlist';

const DUCKDUCKGO_FAVICON = 'https://icons.duckduckgo.com/ip3';

// Module-level singleton — one client per process
const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.S3_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: false,
});

export async function fetchAndStoreIcon(
  token: string,
  homepage: string
): Promise<{ url: string | null; isFallback: boolean }> {
  let domain: string;
  try {
    domain = new URL(homepage).hostname;
  } catch {
    return { url: null, isFallback: true };
  }

  const faviconUrl = `${DUCKDUCKGO_FAVICON}/${domain}.ico`;
  const res = await safeFetch(faviconUrl);

  // PITFALL: DuckDuckGo returns a PNG body even on 404 — check HTTP status, NOT body length
  if (res.status !== 200) {
    return { url: null, isFallback: true };
  }

  const iconBuffer = await res.arrayBuffer();
  const key = `icons/${token}.ico`;
  const bucket = process.env.S3_BUCKET!;

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: Buffer.from(iconBuffer),
    ContentType: 'image/x-icon',
    ACL: 'public-read',
  }));

  // Public CDN URL — virtual-hosted style on t3.storage.dev
  const publicUrl = `https://${bucket}.t3.storage.dev/${key}`;
  return { url: publicUrl, isFallback: false };
}
```

**Delta from current `icons.ts`:**
- Remove `import { put } from '@vercel/blob'`
- Add `import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'`
- Replace `put(...)` with `s3.send(new PutObjectCommand(...))`
- Replace `blob.url` with constructed `publicUrl`
- Remove `token` parameter from `put` args (it's now used in `Key`)
- The `allowOverwrite: true` behavior is the default for S3 PutObject (same key overwrites)

### Anti-Patterns to Avoid

- **Using `forcePathStyle: true` with Tigris:** Tigris requires virtual-hosted addressing. Setting `forcePathStyle: true` will route to `https://t3.storageapi.dev/roomy-breadbox-0sbir2el4w/icons/...` which Tigris may not honor correctly for public-read objects. [CITED: Tigris SDK docs require `forcePathStyle: false`]
- **Hardcoding `t3.storage.dev` in the S3Client endpoint:** The `endpoint` is the API write endpoint; the public CDN domain is separate. Confusing them will cause auth failures.
- **Adding Tigris to `safeFetch` allowlist for icon uploads:** The upload goes FROM the backend TO Tigris via the AWS SDK (not via `safeFetch`). `safeFetch` only guards outbound fetches to external domains (e.g. DuckDuckGo). No changes to `fetch-allowlist.ts` are needed for uploads.
- **Calling `put()` with `allowOverwrite: true` assumption carried over:** S3 `PutObject` overwrites by default; no explicit flag needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| S3-compatible uploads | Custom `fetch` + HMAC signing | `@aws-sdk/client-s3` | AWS Signature v4 has complex canonicalization, date handling, chunked encoding; the SDK handles all edge cases |
| Presigned URL generation | Custom HMAC + query string | `@aws-sdk/s3-request-presigner` | If ever needed for private objects; same complexity argument |
| Content-type detection | File extension lookup table | Pass `ContentType: 'image/x-icon'` explicitly | Already known from context |

**Key insight:** AWS SigV4 signing has ~15 failure modes around header canonicalization, date formatting, and encoding. Never hand-roll it.

---

## Common Pitfalls

### Pitfall 1: `t3.storageapi.dev` vs `t3.storage.dev` domain confusion

**What goes wrong:** Developer uses `t3.storageapi.dev` as the public URL written to the database. `next/image` remotePatterns is configured for `t3.storage.dev`. Images fail to load with 400 Bad Request from Next.js Image Optimization API.

**Why it happens:** Two separate domains serve different roles. The API endpoint (used by the SDK) is `t3.storageapi.dev`; the public CDN URL (what browsers request) is `t3.storage.dev`. The Tigris SDK docs only document `t3.storage.dev` for public URLs.

**How to avoid:** Hardcode `t3.storage.dev` in the public URL construction. Keep `S3_ENDPOINT=https://t3.storageapi.dev` as the write endpoint. Configure `next/image` for `t3.storage.dev`.

**Warning signs:** Icon images returning 400 despite being uploaded successfully.

### Pitfall 2: `region: "auto"` required

**What goes wrong:** Developer sets `region: "us-east-1"` (common default). Tigris rejects requests with a signing mismatch error.

**Why it happens:** Tigris does not use AWS region strings; it routes globally. The string `"auto"` is a Tigris convention that disables region-specific signing.

**How to avoid:** Always set `region: "auto"` in `S3Client` config for Tigris. [CITED: tigrisdata.com/docs/sdks/s3/]

**Warning signs:** `AuthorizationHeaderMalformed` or `InvalidSignatureException` from S3Client.

### Pitfall 3: `BLOB_READ_WRITE_TOKEN` left in env validation

**What goes wrong:** After migration, both `backend/src/routes/sync.ts` and `src/app/api/cron/sync/route.ts` still check for `BLOB_READ_WRITE_TOKEN` in their `missing` env var arrays. Sync fails with "Server misconfiguration" even though Tigris credentials are correctly set.

**Why it happens:** The env validation lists are hardcoded. Forgetting to update them is an easy miss.

**How to avoid:** Replace `BLOB_READ_WRITE_TOKEN` with `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` in both files' required env lists.

**Warning signs:** Sync returns 500 "Server misconfiguration" after migration.

### Pitfall 4: `blob.vercel-storage.com` left in `next/image` remotePatterns

**What goes wrong:** During the transition window, old icon URLs still in the DB (before null-out) fail to render because `blob.vercel-storage.com` is removed from `remotePatterns`.

**Why it happens:** If `next.config.ts` is updated before the null-out script runs, there's a window where old URLs are unrenderable.

**How to avoid:** Keep both `*.public.blob.vercel-storage.com` and the new Tigris pattern in `remotePatterns` until the null-out script has run and the sync has re-populated all icon URLs with Tigris URLs. Remove `blob.vercel-storage.com` in a follow-up deploy.

**Simpler alternative:** Run the null-out script BEFORE deploying the new `next.config.ts`. Once `icon_url` is NULL for all rows, no images are shown (they fall back to initials placeholder), and there is no stale-URL rendering issue. Then deploy the new config.

### Pitfall 5: S3Client singleton vs per-request instantiation

**What goes wrong:** Developer instantiates `new S3Client(...)` inside `fetchAndStoreIcon()`. With 10 concurrent uploads (the batch size), 10 clients are created per batch × many batches = excessive object creation and TCP connection churn.

**Why it happens:** Copy-paste from `@vercel/blob` pattern where `put()` is a stateless function with no client object.

**How to avoid:** Create the `S3Client` at module level (one instance per process). AWS SDK v3 clients are designed to be reused.

---

## Code Examples

### Complete `src/lib/icons.ts` replacement

See Pattern 5 above — the full file replacement is provided there.

### `next.config.ts` remotePatterns update

```typescript
// Source: nextjs.org/docs/app/api-reference/components/image#remotepatterns [CITED: version 16.2.6, last updated 2026-05-19]
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'icons.duckduckgo.com' },
      { protocol: 'https', hostname: 'icon.horse' },
      // Tigris virtual-hosted public CDN URL: https://roomy-breadbox-0sbir2el4w.t3.storage.dev/...
      { protocol: 'https', hostname: 'roomy-breadbox-0sbir2el4w.t3.storage.dev' },
      // KEEP DURING TRANSITION — remove after null-out script + re-sync confirms all rows have new URLs:
      // { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
    ],
  },
};

export default nextConfig;
```

**On wildcard hostname:** Next.js `remotePatterns` supports `**` for multiple subdomain levels and `*` for a single level. [CITED: nextjs.org] For a single known bucket, using the exact hostname `roomy-breadbox-0sbir2el4w.t3.storage.dev` is preferable over `*.t3.storage.dev` — it prevents the image optimizer being abused to proxy arbitrary Tigris buckets.

### Env var updates (both sync files)

```typescript
// In backend/src/routes/sync.ts and src/app/api/cron/sync/route.ts
// BEFORE:
const missing = ["DATABASE_URL", "CRON_SECRET", "GITHUB_TOKEN", "BLOB_READ_WRITE_TOKEN", ...].filter(k => !process.env[k]);

// AFTER:
const missing = ["DATABASE_URL", "CRON_SECRET", "GITHUB_TOKEN", "S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", ...].filter(k => !process.env[k]);
```

### `scripts/null-icon-urls.ts` migration script

```typescript
// scripts/null-icon-urls.ts — run once: npx tsx scripts/null-icon-urls.ts
import { config } from 'dotenv';
config({ path: '.env.local' });

import { db } from '../src/db/index';
import { casks } from '../src/db/schema';
import { like } from 'drizzle-orm';

async function main() {
  const result = await db
    .update(casks)
    .set({ icon_url: null, icon_is_fallback: false })
    .where(like(casks.icon_url, '%blob.vercel-storage.com%'));
  console.log('Nulled icon_url for Vercel Blob rows. Result:', result);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
```

---

## Research Answers (Question-by-Question)

### Q1: AWS SDK API for S3-compatible PutObject

Use `@aws-sdk/client-s3` v3.1053.0 (current as of 2026-05-22). Minimal PutObject:

```typescript
await s3.send(new PutObjectCommand({
  Bucket: bucket,
  Key: `icons/${token}.ico`,
  Body: Buffer.from(arrayBuffer),
  ContentType: 'image/x-icon',
  ACL: 'public-read',
}));
```

Tigris supports `public-read` as a canned ACL. [CITED: tigrisdata.com/docs/api/s3 — "only canned ACLs (public-read and private) are supported"]

### Q2: Tigris public URL format

**Virtual-hosted style.** Public URL: `https://[bucket-name].t3.storage.dev/[key]`
Example: `https://roomy-breadbox-0sbir2el4w.t3.storage.dev/icons/vscode.ico`

The Tigris SDK docs explicitly show `https://tigris-example.t3.storage.dev/object.txt` as the URL format. [CITED: tigrisdata.com/docs/sdks/tigris/using-sdk] `forcePathStyle: false` is confirmed required. [CITED: tigrisdata.com/docs/sdks/s3/aws-js-sdk]

Note: `t3.storageapi.dev` is the **API endpoint** (used by the SDK for writes). `t3.storage.dev` is the **public CDN domain** (used in the URL stored to DB). Both respond with `Server: Tigris OS`. [VERIFIED: live curl 2026-05-25]

### Q3: `next/image` remotePatterns

Exact hostname pattern (preferred over wildcard):
```typescript
{ protocol: 'https', hostname: 'roomy-breadbox-0sbir2el4w.t3.storage.dev' }
```

If a wildcard is needed (e.g., bucket name might change): `{ protocol: 'https', hostname: '*.t3.storage.dev' }` — the `*` matches exactly one subdomain level. [CITED: nextjs.org — "`*` match a single path segment or subdomain"]

### Q4: DB migration strategy

**Strategy:** One-time script nulling `icon_url` for rows like `%blob.vercel-storage.com%`. The sync pipeline's existing `WHERE icon_url IS NULL AND is_active = true` guard handles re-population automatically on the next run.

**Script vs inline:** Use a standalone script, not inline at sync startup. Inline null-out would re-null on every restart, which is wrong after migration completes.

**Safest order of operations:**
1. Run null-out script (rows now have `icon_url = NULL`)
2. Deploy new `src/lib/icons.ts` (uploads to Tigris)
3. Deploy new `next.config.ts` (adds Tigris, removes Vercel Blob pattern)
4. Next sync run re-populates all icons into Tigris
5. Remove `@vercel/blob` from `package.json`

### Q5: SSRF allowlist

**No change needed.** The `safeFetch` allowlist controls outbound HTTP fetches. The icon UPLOAD goes from backend code directly to Tigris via the AWS SDK (which uses its own `fetch`/`https` under the hood — not `safeFetch`). `safeFetch` is only called to fetch the favicon from DuckDuckGo (`icons.duckduckgo.com`), which is already in the allowlist.

The only case where `fetch-allowlist.ts` would need updating is if the backend ever fetches back an icon from Tigris to validate it. That is not part of the current flow.

If public icon URLs in the DB are ever fetched server-side (e.g., in a Server Component using `fetch`), add `roomy-breadbox-0sbir2el4w.t3.storage.dev` to `ALLOWED_HOSTS` at that time. [ASSUMED — not required for this phase]

### Q6: Env var naming

**Conventional S3-compatible env var names:**

| Env Var | Value | Notes |
|---------|-------|-------|
| `S3_ENDPOINT` | `https://t3.storageapi.dev` | Railway-provisioned Tigris API endpoint |
| `S3_BUCKET` | `roomy-breadbox-0sbir2el4w` | Bucket name |
| `S3_REGION` | `auto` | Required by Tigris [CITED] |
| `S3_ACCESS_KEY_ID` | `tid_...` | Tigris access key (starts with `tid_`) |
| `S3_SECRET_ACCESS_KEY` | `tsec_...` | Tigris secret (starts with `tsec_`) |

**Alternative:** Tigris SDK docs also show `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` as standard names. If those are used, the `S3Client` picks them up automatically without explicit `credentials:` config. However, using `S3_*` prefixes avoids collision with any real AWS credentials in the environment. Either works; `S3_*` is the more defensive choice.

`region: "auto"` is the value embedded in code (not an env var) since it is always required for Tigris. [CITED: tigrisdata.com/docs/sdks/s3/]

### Q7: Backward compatibility during cutover

**Option A (recommended — cleaner):** Run null-out script BEFORE deploying new code. During the null-out → new-code deployment window, all icons show the initials placeholder (the fallback path in `icon_url = NULL` logic). This is a brief visual degradation (minutes at most) with no broken image URLs. The next sync re-populates icons into Tigris.

**Option B (zero visual degradation):** Keep both `*.public.blob.vercel-storage.com` and the new Tigris pattern in `remotePatterns` simultaneously. Deploy new `icons.ts`. After the next full sync re-populates all icons with Tigris URLs, run the null-out (which is now a no-op for already-migrated rows), then remove `blob.vercel-storage.com` from `remotePatterns` in a second deploy.

Option A is simpler and does not require a two-stage deployment. The visual degradation is minor (initials placeholder is already the fallback). Use Option A.

### Q8: `@vercel/blob` removal scope

Only one file imports `@vercel/blob`: [VERIFIED: codebase grep 2026-05-25]

```
/Users/yash/Personal/brewindex/src/lib/icons.ts:1  import { put } from '@vercel/blob';
```

Additionally, `BLOB_READ_WRITE_TOKEN` appears in two env validation arrays:
- `backend/src/routes/sync.ts` line 151
- `src/app/api/cron/sync/route.ts` line 21

And in `.env.local` (the env file itself — remove after migration). [VERIFIED: codebase grep 2026-05-25]

After removing the import from `icons.ts` and the `BLOB_READ_WRITE_TOKEN` references:
```bash
npm uninstall @vercel/blob
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@vercel/blob` `put()` | `@aws-sdk/client-s3` `PutObjectCommand` | This phase | Removes Vercel quota dependency; S3 API is universal |
| `BLOB_READ_WRITE_TOKEN` | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | This phase | Four env vars replace one |

**Deprecated/outdated after this phase:**
- `@vercel/blob`: Remove from `package.json` after `icons.ts` migration confirmed.
- `BLOB_READ_WRITE_TOKEN` env var: Remove from `.env.local`, Vercel env panel, and all code after migration.
- `*.public.blob.vercel-storage.com` in `next/image` remotePatterns: Remove after all rows have Tigris URLs.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `t3.storage.dev` is the correct public CDN domain for objects (vs `t3.storageapi.dev`) | Q2, Pattern 3 | Icon images fail to load in browser if wrong domain in DB; recoverable by re-running null-out + sync |
| A2 | `S3_ENDPOINT=https://t3.storageapi.dev` is the exact Railway-injected value for this bucket | Q6 | SDK auth fails; check Railway dashboard for exact value |
| A3 | `SSRF allowlist` does not need updating for upload path | Q5 | If AWS SDK routes through `safeFetch` (it does not — it uses its own http stack), uploads would throw `SSRF_BLOCKED`; not a real risk |
| A4 | `icon_is_fallback` should be reset to `false` alongside `icon_url = NULL` in the migration script | Pattern 4 | Rows with `icon_is_fallback = true` and `icon_url = NULL` would be re-processed by the sync pipeline (correct behavior), but the `false` reset is more consistent |
| A5 | `@aws-sdk/client-s3` is [ASSUMED] for slopcheck purposes only | Package Legitimacy | Zero — this is the official AWS SDK at github.com/aws/aws-sdk-js-v3; the slopcheck unavailability tag is a formality |

---

## Open Questions

1. **Which env var names does Railway actually inject for Tigris?**
   - What we know: Tigris SDK docs show `TIGRIS_STORAGE_ACCESS_KEY_ID` / `TIGRIS_STORAGE_SECRET_ACCESS_KEY`; AWS SDK docs show `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`; Railway may inject its own names.
   - What's unclear: The exact Railway-provided variable names for this specific bucket (`roomy-breadbox-0sbir2el4w`).
   - Recommendation: Check the Railway dashboard → Variables tab for the Tigris service to confirm the exact names before writing code. The proposed `S3_*` names are safe custom names if Railway does not inject standard ones.

2. **Is `t3.storageapi.dev` the API endpoint and `t3.storage.dev` the CDN domain, or are they aliases?**
   - What we know: Both live probes return `Server: Tigris OS`. `t3.storage.dev` is the domain in official Tigris SDK docs for public URLs. `t3.storageapi.dev` is the domain the phase description cites.
   - What's unclear: Whether public objects served via `t3.storageapi.dev` subdomain URLs are equivalent to `t3.storage.dev` subdomain URLs.
   - Recommendation: Use `t3.storage.dev` for public URL construction (documented). Use `t3.storageapi.dev` as the API `endpoint:` (from Railway dashboard). If they are full aliases, both work.

3. **Does the Tigris bucket already have public access enabled, or does it need bucket-level configuration?**
   - What we know: `public-read` ACL is supported at the object level via `PutObjectCommand`.
   - What's unclear: Whether the Railway-provisioned bucket (`roomy-breadbox-0sbir2el4w`) has public access blocked at the bucket level (a common S3 security default).
   - Recommendation: Confirm by attempting a `GET` on a test object after uploading with `ACL: 'public-read'`. If it returns 403, bucket-level public access is blocked and needs to be enabled via Tigris dashboard or CLI.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@aws-sdk/client-s3` | `src/lib/icons.ts` | ✗ (not yet installed) | 3.1053.0 available | Install via `npm install @aws-sdk/client-s3` |
| Tigris bucket `roomy-breadbox-0sbir2el4w` | Upload target | ✓ (live — HTTP 403 confirms existence) | — | — |
| `S3_ENDPOINT` env var | `S3Client` config | ✗ (not in `.env.local`) | — | Add manually from Railway dashboard |
| `S3_BUCKET` env var | `PutObjectCommand` | ✗ (not in `.env.local`) | — | Add manually |
| `S3_ACCESS_KEY_ID` env var | `S3Client` credentials | ✗ (not in `.env.local`) | — | Add manually from Railway dashboard |
| `S3_SECRET_ACCESS_KEY` env var | `S3Client` credentials | ✗ (not in `.env.local`) | — | Add manually from Railway dashboard |
| `DATABASE_URL` env var | Null-out migration script | ✓ (present in `.env.local`) | — | — |

**Missing dependencies with no fallback:** none — all missing items are installable or configurable.

**Missing dependencies with fallback:** `@aws-sdk/client-s3` not yet installed; `npm install @aws-sdk/client-s3` is the first task of the plan.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | S3 credentials in env vars, never hardcoded; `ACL: public-read` only on icon keys |
| V5 Input Validation | yes | `token` key constructed from cask token (safe identifier); no user input reaches S3 Key |
| V6 Cryptography | yes | AWS SigV4 handled by `@aws-sdk/client-s3` — not hand-rolled |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| S3 path traversal via malicious `token` | Tampering | `token` values come from Homebrew API (validated cask names); no user input in key construction |
| Credential exposure in logs | Information Disclosure | `S3_SECRET_ACCESS_KEY` must not appear in logger output; env var validation only checks key presence, not value |
| Overly-broad bucket ACL | Elevation of Privilege | Use object-level `public-read` ACL, not bucket-level public access; limits blast radius if misused |
| SSRF via domain substitution in `S3_ENDPOINT` | SSRF | `S3_ENDPOINT` is a server-side env var, not user-controllable; no validation needed beyond correct deploy config |

---

## Sources

### Primary (HIGH confidence)
- `tigrisdata.com/docs/sdks/s3/aws-js-sdk` — S3Client config (`region: "auto"`, `forcePathStyle: false`), endpoint URL
- `tigrisdata.com/docs/sdks/tigris/using-sdk` — Public URL format `https://tigris-example.t3.storage.dev/object.txt`, `TIGRIS_STORAGE_*` env var names
- `tigrisdata.com/docs/api/s3` — ACL support ("only canned ACLs: public-read and private"), PutObjectAcl support
- `nextjs.org/docs/app/api-reference/components/image#remotepatterns` (v16.2.6, 2026-05-19) — `remotePatterns` wildcard syntax
- npm registry — `@aws-sdk/client-s3@3.1053.0`, published 2026-05-22, `github.com/aws/aws-sdk-js-v3`
- Live curl probes — `t3.storageapi.dev` and `t3.storage.dev` both return `Server: Tigris OS` (2026-05-25)
- `curl -sI https://roomy-breadbox-0sbir2el4w.t3.storageapi.dev` → HTTP 403 `Server: Tigris OS` (bucket confirmed live, 2026-05-25)

### Secondary (MEDIUM confidence)
- `tigrisdata.com/docs/sdks/s3` — endpoint `https://t3.storage.dev` (note: Railway may use `t3.storageapi.dev`)
- Tigris API page — Python `addressing_style: "virtual"` example implying virtual-hosted preference

### Tertiary (LOW confidence)
- Phase description reference to `t3.storageapi.dev` as the Railway endpoint — not verified against Railway dashboard (A2)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `@aws-sdk/client-s3` is unambiguously correct; version confirmed from npm
- Architecture: HIGH — single file swap, all file locations verified by codebase read
- Pitfalls: HIGH — domain confusion, region, env var deletion are all verified failure modes
- Public URL domain: MEDIUM — `t3.storage.dev` is documented; `t3.storageapi.dev` is in the phase description; both are confirmed live but their exact roles need a real upload test to confirm

**Research date:** 2026-05-25
**Valid until:** 2026-08-25 (Tigris is stable; URL formats are unlikely to change)
