import { PackageX } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: '48px 24px',
        gap: '16px',
      }}
    >
      <PackageX size={48} style={{ color: 'var(--color-text-faint)' }} />
      <h1
        style={{
          fontSize: '1rem',
          fontWeight: 700,
          color: 'var(--color-text)',
          margin: 0,
        }}
      >
        Cask not found
      </h1>
      <p
        style={{
          fontSize: '0.8125rem',
          color: 'var(--color-text-muted)',
          textAlign: 'center',
          maxWidth: '480px',
          lineHeight: 1.5,
        }}
      >
        We couldn&apos;t find a cask with that token. It may have been removed from Homebrew, or
        the URL might be incorrect.
      </p>
      <Link
        href="/browse"
        style={{
          background: 'rgba(124,106,255,0.15)',
          border: '1px solid rgba(124,106,255,0.25)',
          color: '#9581ff',
          borderRadius: '9999px',
          padding: '6px 16px',
          fontSize: '0.8125rem',
          textDecoration: 'none',
        }}
      >
        Browse all casks
      </Link>
    </main>
  );
}
