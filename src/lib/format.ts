/**
 * Formats an install count for display in the UI.
 *
 * | Condition        | Format           | Example |
 * |------------------|------------------|---------|
 * | value >= 1M      | {X.X}M (1 dec)   | 4.8M    |
 * | value >= 1K      | {X}K (no dec)    | 421K    |
 * | value < 1K       | raw integer      | 847     |
 * | value is null    | em dash          | —       |
 */
export function formatInstallCount(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.floor(value / 1_000)}K`;
  return String(value);
}
