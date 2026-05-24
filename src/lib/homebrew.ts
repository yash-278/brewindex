import { z } from 'zod/v4';
import { safeFetch } from './fetch-allowlist';
import type { CaskInsertRow } from '@/db/schema';

// ---------------------------------------------------------------------------
// Zod schemas for Homebrew API responses
// ---------------------------------------------------------------------------

const HomebrewCaskSchema = z.object({
  token:      z.string(),
  name:       z.array(z.string()).min(1), // PITFALL: name is string[] — always use [0]
  desc:       z.string().nullable(),
  homepage:   z.string(),
  version:    z.string(),
  deprecated: z.boolean(),
  disabled:   z.boolean(),
});

const AnalyticsEntrySchema = z.object({
  cask:  z.string(),
  count: z.string(), // PITFALL: comma-formatted "204,909" — strip before parseInt
});

const AnalyticsResponseSchema = z.object({
  formulae: z.array(AnalyticsEntrySchema),
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOMEBREW_CASK_API = 'https://formulae.brew.sh/api/cask.json';
const ANALYTICS_BASE    = 'https://formulae.brew.sh/api/analytics/cask-install/homebrew-cask';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a comma-formatted analytics count string to an integer.
 * PITFALL: parseInt("204,909") === 204 (stops at comma). Strip commas first.
 */
export function parseAnalyticsCount(raw: string): number {
  return parseInt(raw.replace(/,/g, ''), 10) || 0;
}

/**
 * Map a validated Homebrew cask + analytics map entry to a CaskInsertRow.
 * Does NOT set icon_url, icon_is_fallback, or github_* fields — those are
 * added by Plans 03 and 04 respectively.
 */
export function mapHomebrewCask(
  cask: z.infer<typeof HomebrewCaskSchema>,
  analytics: Map<string, { d30: number; d90: number; d365: number }>,
): CaskInsertRow {
  const counts = analytics.get(cask.token) ?? { d30: 0, d90: 0, d365: 0 };
  return {
    token:          cask.token,
    name:           cask.name[0], // PITFALL: take [0], not whole array
    description:    cask.desc ?? null,
    version:        cask.version,
    homepage:       cask.homepage,
    install_30d:    counts.d30,
    install_90d:    counts.d90,
    install_365d:   counts.d365,
    is_active:      !cask.deprecated && !cask.disabled,
    last_synced_at: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Fetch functions
// ---------------------------------------------------------------------------

/**
 * Fetch and validate the full Homebrew cask catalog (~7,659 casks).
 * Uses safeFetch (SSRF allowlist) — never raw fetch.
 */
export async function fetchHomebrewCatalog(): Promise<z.infer<typeof HomebrewCaskSchema>[]> {
  const res = await safeFetch(HOMEBREW_CASK_API);
  if (!res.ok) throw new Error(`Homebrew catalog fetch failed: ${res.status}`);
  const raw = await res.json();
  return z.array(HomebrewCaskSchema).parse(raw);
}

/**
 * Fetch analytics from all three periods (30d, 90d, 365d) in parallel and
 * merge into a single Map<token, counts>.
 *
 * PITFALL: Analytics are NOT included in the bulk cask.json endpoint.
 * Must fetch 3 separate analytics endpoints and merge in-memory.
 */
export async function fetchHomebrewAnalytics(): Promise<Map<string, { d30: number; d90: number; d365: number }>> {
  const [d30res, d90res, d365res] = await Promise.all([
    safeFetch(`${ANALYTICS_BASE}/30d.json`),
    safeFetch(`${ANALYTICS_BASE}/90d.json`),
    safeFetch(`${ANALYTICS_BASE}/365d.json`),
  ]);

  if (!d30res.ok) throw new Error(`Analytics 30d fetch failed: ${d30res.status}`);
  if (!d90res.ok) throw new Error(`Analytics 90d fetch failed: ${d90res.status}`);
  if (!d365res.ok) throw new Error(`Analytics 365d fetch failed: ${d365res.status}`);

  const [d30data, d90data, d365data] = await Promise.all([
    d30res.json().then(r => AnalyticsResponseSchema.parse(r)),
    d90res.json().then(r => AnalyticsResponseSchema.parse(r)),
    d365res.json().then(r => AnalyticsResponseSchema.parse(r)),
  ]);

  const map = new Map<string, { d30: number; d90: number; d365: number }>();

  for (const entry of d30data.formulae) {
    const existing = map.get(entry.cask) ?? { d30: 0, d90: 0, d365: 0 };
    map.set(entry.cask, { ...existing, d30: parseAnalyticsCount(entry.count) });
  }
  for (const entry of d90data.formulae) {
    const existing = map.get(entry.cask) ?? { d30: 0, d90: 0, d365: 0 };
    map.set(entry.cask, { ...existing, d90: parseAnalyticsCount(entry.count) });
  }
  for (const entry of d365data.formulae) {
    const existing = map.get(entry.cask) ?? { d30: 0, d90: 0, d365: 0 };
    map.set(entry.cask, { ...existing, d365: parseAnalyticsCount(entry.count) });
  }

  return map;
}
