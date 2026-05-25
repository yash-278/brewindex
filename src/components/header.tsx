import Link from 'next/link';
import { Suspense } from 'react';
import { SearchInput } from '@/components/search-input';

export function Header({ caskCount }: { caskCount: number }) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        height: '56px',
        background: 'var(--color-bg)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: '24px',
      }}
    >
      {/* Logo + wordmark — clicks navigate to home */}
      <Link
        href="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexShrink: 0,
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>🍺</span>
        <span
          style={{
            fontSize: '1rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--color-text)',
          }}
        >
          BrewIndex
        </span>
      </Link>

      {/* Search input client island — Suspense required for useSearchParams */}
      <Suspense
        fallback={
          <input
            type="text"
            placeholder="Search casks…"
            disabled
            style={{
              flex: 1,
              maxWidth: '480px',
              opacity: 0.55,
              cursor: 'not-allowed',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '8px 12px',
              color: 'var(--color-text-muted)',
              fontSize: '0.8125rem',
            }}
          />
        }
      >
        <SearchInput />
      </Suspense>

      {/* Cask count */}
      <span
        style={{
          fontSize: '0.8125rem',
          color: 'var(--color-text-muted)',
          marginLeft: 'auto',
          flexShrink: 0,
        }}
      >
        {caskCount.toLocaleString()} casks
      </span>
    </header>
  );
}
