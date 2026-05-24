import { PackageOpen } from 'lucide-react';
import type { CaskSelectRow } from '@/db/schema';
import { CaskCard } from '@/components/cask-card';

export function CaskGrid({ casks }: { casks: CaskSelectRow[] }) {
  if (casks.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 24px',
          gap: '16px',
          textAlign: 'center',
        }}
      >
        <PackageOpen size={48} style={{ color: 'var(--color-text-faint)' }} />
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
          No casks available
        </h2>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: 0 }}>
          The cask catalog is syncing. Check back in a few minutes.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))',
        gap: '12px',
      }}
    >
      {casks.map((cask) => (
        <CaskCard key={cask.token} cask={cask} />
      ))}
    </div>
  );
}
