const ALLOWED_HOSTS = new Set([
  'formulae.brew.sh',
  'api.github.com',
  'icons.duckduckgo.com',
  'icon.horse',
]);

const BLOCKED_CIDR_PREFIXES = [
  '127.', '10.', '192.168.', '169.254.', '::1',
  '172.16.', '172.17.', '172.18.', '172.19.',
  '172.20.', '172.21.', '172.22.', '172.23.',
  '172.24.', '172.25.', '172.26.', '172.27.',
  '172.28.', '172.29.', '172.30.', '172.31.',
];

export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  const hostname = new URL(url).hostname;
  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new Error(`SSRF_BLOCKED: hostname "${hostname}" not in allowlist`);
  }
  const response = await fetch(url, { ...init, redirect: 'follow' });
  const finalHostname = new URL(response.url).hostname;
  if (BLOCKED_CIDR_PREFIXES.some(p => finalHostname.startsWith(p))) {
    throw new Error(`SSRF_BLOCKED: redirect target "${finalHostname}" is a private address`);
  }
  return response;
}
