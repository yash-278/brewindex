import { put } from '@vercel/blob';
import { safeFetch } from './fetch-allowlist';

const DUCKDUCKGO_FAVICON = 'https://icons.duckduckgo.com/ip3';

export async function fetchAndStoreIcon(
  token: string,
  homepage: string
): Promise<{ url: string | null; isFallback: boolean }> {
  let domain: string;
  try {
    domain = new URL(homepage).hostname;
  } catch {
    // Invalid or empty homepage URL — return fallback immediately
    return { url: null, isFallback: true };
  }

  const faviconUrl = `${DUCKDUCKGO_FAVICON}/${domain}.ico`;
  const res = await safeFetch(faviconUrl);

  // PITFALL: DuckDuckGo returns a PNG body even on 404 — check HTTP status, NOT body length
  if (res.status !== 200) {
    return { url: null, isFallback: true };
  }

  const iconBuffer = await res.arrayBuffer();
  const blob = await put(`icons/${token}.ico`, iconBuffer, {
    access: 'public',
    contentType: 'image/x-icon',
    allowOverwrite: true,
  });

  return { url: blob.url, isFallback: false };
}
