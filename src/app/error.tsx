'use client';

/**
 * Global error boundary for the App Router.
 * Catches unhandled errors thrown during page rendering and shows a
 * minimal recovery UI instead of a Next.js 500 error page.
 */
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main style={{ padding: '48px 24px', textAlign: 'center' }}>
      <p style={{ color: 'var(--color-text-muted)' }}>
        Something went wrong.{' '}
        <button
          type="button"
          onClick={reset}
          style={{ color: 'var(--color-primary-hover)', cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit' }}
        >
          Try again
        </button>
      </p>
    </main>
  );
}
