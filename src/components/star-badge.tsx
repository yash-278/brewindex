import { formatInstallCount } from '@/lib/format';

export function StarBadge({ count }: { count: number }) {
  return (
    <span
      aria-label={`GitHub stars: ${count}`}
      style={{
        background: 'rgba(124,106,255,0.15)',
        border: '1px solid rgba(124,106,255,0.25)',
        color: '#9581ff',
        borderRadius: '9999px',
        padding: '2px 8px',
        fontSize: '0.6875rem',
        whiteSpace: 'nowrap',
      }}
    >
      ★ {formatInstallCount(count)}
    </span>
  );
}
