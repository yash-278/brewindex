import type { CaskSelectRow } from '@/db/schema';
import { formatInstallCount } from '@/lib/format';
import { Star, GitFork, AlertCircle } from 'lucide-react';

export function GitHubStatsCard({ cask }: { cask: CaskSelectRow }) {
  // Only render if GitHub enrichment succeeded and star count is available (D-12)
  if (!cask.github_enriched || cask.github_stars === null) {
    return null;
  }

  return (
    <section style={{ marginTop: '32px' }}>
      <p
        style={{
          fontSize: '0.6875rem',
          fontWeight: 400,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: 'var(--color-text-faint)',
          marginBottom: '10px',
        }}
      >
        REPOSITORY STATS
      </p>

      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '10px',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          flexWrap: 'wrap',
        }}
      >
        {/* Stars — primary stat, larger icon with accent color */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Star size={20} style={{ color: '#9581ff' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: 'var(--color-text)',
              }}
            >
              {formatInstallCount(cask.github_stars)}
            </span>
            <span
              style={{
                fontSize: '0.6875rem',
                color: 'var(--color-text-faint)',
              }}
            >
              stars
            </span>
          </div>
        </div>

        {/* Separator */}
        <div
          style={{
            width: '1px',
            height: '32px',
            background: 'var(--color-border-subtle)',
          }}
        />

        {/* Forks */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <GitFork size={16} style={{ color: 'var(--color-text-muted)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: 'var(--color-text)',
              }}
            >
              {formatInstallCount(cask.github_forks)}
            </span>
            <span
              style={{
                fontSize: '0.6875rem',
                color: 'var(--color-text-faint)',
              }}
            >
              forks
            </span>
          </div>
        </div>

        {/* Separator */}
        <div
          style={{
            width: '1px',
            height: '32px',
            background: 'var(--color-border-subtle)',
          }}
        />

        {/* Open Issues */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} style={{ color: 'var(--color-text-muted)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: 'var(--color-text)',
              }}
            >
              {formatInstallCount(cask.github_issues)}
            </span>
            <span
              style={{
                fontSize: '0.6875rem',
                color: 'var(--color-text-faint)',
              }}
            >
              open issues
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
