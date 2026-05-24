import { Octokit } from '@octokit/core';
import { throttling } from '@octokit/plugin-throttling';

// Module-level constant — ThrottledOctokit class is created once, not per request
const ThrottledOctokit = Octokit.plugin(throttling);

// Singleton Octokit instance with throttling — handles primary and secondary rate limits automatically
// D-03: Uses GITHUB_TOKEN PAT with read:repo scope
// D-04: Retries up to 2x on primary rate limit; always retries secondary rate limits
// Do NOT add manual sleep loops — @octokit/plugin-throttling handles retry-after automatically
export const octokit = new ThrottledOctokit({
  auth: process.env.GITHUB_TOKEN,
  throttle: {
    onRateLimit: (retryAfter: number, options: unknown, _octokit: Octokit, retryCount: number) => {
      if (retryCount < 2) return true; // retry twice before giving up on primary rate limit
    },
    onSecondaryRateLimit: (_retryAfter: number, _options: unknown, _octokit: Octokit) => {
      return true; // always retry secondary rate limits (abuse detection)
    },
  },
});

// Strict regex: matches https://github.com/{owner}/{repo} only
// PITFALL (Pitfall 7): Non-repo URLs like https://codeql.github.com/ or
// https://docs.github.com/en/... do NOT match because they lack /{owner}/{repo} path segments
const GITHUB_REPO_PATTERN = /^https:\/\/github\.com\/([^\/]+)\/([^\/\?#]+)/;

// Owners whose repos should be excluded from GitHub enrichment
// PITFALL (Pitfall 7): googlefonts repos are font repositories, not app repos
const EXCLUDED_OWNERS = new Set(['googlefonts']);

/**
 * Extract GitHub owner and repo from a homepage URL.
 *
 * Returns null for:
 * - Non-GitHub URLs
 * - GitHub URLs that are not repo URLs (e.g. codeql.github.com, docs.github.com)
 * - Repos belonging to excluded owners (e.g. googlefonts)
 *
 * T-04-02: extractGithubRepo uses strict regex — owner and repo segments exclude
 * /, ?, # characters, preventing path traversal in octokit.request({owner}/{repo}).
 */
export function extractGithubRepo(homepage: string): { owner: string; repo: string } | null {
  const match = homepage.match(GITHUB_REPO_PATTERN);
  if (!match) return null;

  const owner = match[1];
  const repo = match[2];

  if (EXCLUDED_OWNERS.has(owner.toLowerCase())) return null;

  return { owner, repo };
}

/**
 * Fetch GitHub repository stats (stars, forks, open issues) for a given owner/repo.
 *
 * D-04: Returns null (not a throw) when the repo returns 404 or 403 (inaccessible).
 * The caller sets github_enriched = false for null results.
 * Re-throws any unexpected errors so the caller can handle them.
 *
 * T-04-01: GITHUB_TOKEN is never logged, never returned in responses, never included
 * in console.warn messages (only owner/repo path is logged on 404/403).
 */
export async function fetchGithubStats(
  owner: string,
  repo: string
): Promise<{ stars: number; forks: number; issues: number } | null> {
  try {
    const { data } = await octokit.request('GET /repos/{owner}/{repo}', { owner, repo });
    return {
      stars: data.stargazers_count,
      forks: data.forks_count,
      issues: data.open_issues_count,
    };
  } catch (err: unknown) {
    // D-04: 404 = repo not found, 403 = access forbidden — both are expected non-error conditions
    // T-04-04: Log owner/repo path only (public Homebrew data) — no secrets or internal state
    const status = (err as { status?: number }).status;
    if (status === 404 || status === 403) {
      console.warn(`[github] ${owner}/${repo} inaccessible (${status})`);
      return null;
    }
    // Re-throw unexpected errors (network failures, 5xx, etc.)
    throw err;
  }
}
