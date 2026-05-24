/**
 * 6-slot color palette for initials avatars.
 * Colors are vivid enough to read white text against.
 * Deterministic — same token always maps to same color via djb2(token) % 6.
 */
const INITIALS_PALETTE = [
  '#2563eb', // blue
  '#7c3aed', // violet
  '#059669', // emerald
  '#d97706', // amber
  '#dc2626', // red
  '#0891b2', // cyan
] as const;

/**
 * djb2 hash function — fast, deterministic, good distribution for short strings.
 * Returns a non-negative 32-bit integer.
 */
export function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Returns a background color from INITIALS_PALETTE deterministically based on token.
 */
export function getInitialsColor(token: string): string {
  return INITIALS_PALETTE[djb2(token) % 6];
}

/**
 * Returns 1-2 uppercase initials from a cask token.
 * Single-part tokens: first 2 characters (e.g. "git" → "GI").
 * Multi-part tokens: first char of first two parts (e.g. "visual-studio-code" → "VS").
 */
export function getInitials(token: string): string {
  const parts = token.split('-').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
