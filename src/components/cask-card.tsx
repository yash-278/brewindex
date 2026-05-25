import Link from 'next/link';
import type { CaskSelectRow } from '@/db/schema';
import { CaskIcon } from '@/components/cask-icon';
import { formatInstallCount } from '@/lib/format';

export function CaskCard({ cask }: { cask: CaskSelectRow }) {
  return (
    <Link
      href={'/cask/' + cask.token}
      className="hover:border-[rgba(124,106,255,0.4)] hover:bg-[var(--color-surface-hover)] hover:[box-shadow:var(--shadow-glow)]"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '16px',
        padding: '20px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '14px',
        transition: 'all 0.15s ease',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      {/* Icon slot */}
      <div style={{ flexShrink: 0, marginTop: '2px' }}>
        <CaskIcon
          token={cask.token}
          name={cask.name}
          iconUrl={cask.icon_is_fallback ? null : cask.icon_url}
          size={52}
        />
      </div>

      {/* Card body */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {/* Header row: name + version */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
              color: 'var(--color-text)',
            }}
          >
            {cask.name}
          </span>
          <span
            style={{
              fontSize: '0.6875rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-faint)',
              flexShrink: 0,
              marginLeft: 'auto',
            }}
          >
            {cask.version ?? ''}
          </span>
        </div>

        {/* Description */}
        <p
          style={{
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            fontSize: '0.8125rem',
            color: 'var(--color-text-muted)',
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {cask.description ?? ''}
        </p>

        {/* Metadata strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginTop: '4px',
          }}
        >
          {/* Installs pill */}
          <span
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
            ↓ {formatInstallCount(cask.install_365d)} / yr
          </span>

          {/* Platform pill */}
          <span
            style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
              borderRadius: '9999px',
              padding: '2px 8px',
              fontSize: '0.6875rem',
            }}
          >
            macOS
          </span>

          {/* Token */}
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6875rem',
              color: 'var(--color-text-faint)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '120px',
            }}
          >
            {cask.token}
          </span>
        </div>
      </div>
    </Link>
  );
}
