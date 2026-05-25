import { getCaskByToken, getTop500Tokens } from '@/lib/queries';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { CopyButton } from '@/components/copy-button';
import { InitialsAvatar } from '@/components/initials-avatar';
import { formatInstallCount } from '@/lib/format';
import { DARK_BLUR_DATA_URL } from '@/lib/blur-data-url';
import { safeExternalUrl } from '@/lib/utils';
import type { Metadata } from 'next';
import type { CaskSelectRow } from '@/db/schema';

/** Pre-render the top 500 casks by install count at build time. */
export async function generateStaticParams() {
  const tokens = await getTop500Tokens();
  return tokens.map((t) => ({ token: t.token }));
}

/** Set the page title to "{Cask Name} — BrewIndex" or a not-found fallback. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const cask = await getCaskByToken(token);
  if (!cask) return { title: 'Cask not found — BrewIndex' };
  return { title: `${cask.name} — BrewIndex` };
}

/** Returns a relative date string like "3 days ago", "2 months ago", "1 year ago". */
function formatRelativeDate(date: Date | string): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return 'today';
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

/** Extracts the hostname from a URL, removing the www. prefix. Returns empty string on error. */
function getDomain(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export default async function CaskPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const cask = await getCaskByToken(token);
  if (!cask) notFound();

  // TypeScript narrowing — cask is guaranteed non-null after notFound() above
  const c = cask as CaskSelectRow;
  // Validate homepage URL — only allow http:/https: to prevent XSS via javascript: hrefs
  const safeHomepage = safeExternalUrl(c.homepage);
  const domain = getDomain(safeHomepage);

  return (
    <main
      style={{
        maxWidth: '1100px',
        margin: '0 auto',
        padding: '0 24px 48px',
      }}
    >
      {/* Back navigation */}
      <div style={{ paddingTop: '20px' }}>
        <Link
          href="/browse"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.8125rem',
            color: 'var(--color-text-muted)',
            textDecoration: 'none',
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            transition: 'color 0.15s ease, border-color 0.15s ease',
          }}
        >
          ← Back to Browse
        </Link>
      </div>

      {/* Hero Section */}
      <div
        style={{
          borderBottom: '1px solid var(--color-border)',
          padding: '40px 0 32px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '24px',
        }}
      >
        {/* Icon slot */}
        {c.icon_is_fallback || !c.icon_url ? (
          <InitialsAvatar token={c.token} size={80} />
        ) : (
          <Image
            src={c.icon_url}
            width={80}
            height={80}
            alt={`${c.name} icon`}
            className="rounded-[18px]"
            placeholder="blur"
            blurDataURL={DARK_BLUR_DATA_URL}
            preload
          />
        )}

        {/* Hero body */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <h1
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
              color: 'var(--color-text)',
              margin: 0,
            }}
          >
            {c.name}
          </h1>

          <p
            style={{
              fontSize: '0.6875rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-faint)',
              marginTop: '4px',
            }}
          >
            v{c.version ?? '—'} · Last updated {formatRelativeDate(c.last_synced_at)}
          </p>

          <p
            style={{
              fontSize: '1rem',
              color: 'var(--color-text-muted)',
              marginTop: '12px',
              maxWidth: '640px',
              lineHeight: 1.5,
            }}
          >
            {c.description ?? ''}
          </p>

          {/* Links row */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            {domain && safeHomepage && (
              <a
                href={safeHomepage}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '0.8125rem',
                  color: 'var(--color-text-muted)',
                  textDecoration: 'none',
                }}
              >
                ↗ {domain}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Install Section */}
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
          INSTALL
        </p>
        <div
          style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            maxWidth: '640px',
          }}
        >
          <code style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
            <span style={{ color: 'var(--color-text-faint)' }}>brew install --cask </span>
            <span style={{ color: '#9581ff' }}>{c.token}</span>
          </code>
          <CopyButton token={c.token} />
        </div>
      </section>

      {/* Stats + Metadata row */}
      <div
        style={{
          display: 'flex',
          gap: '32px',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          marginTop: '32px',
        }}
      >
        {/* Stats block */}
        <div>
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
            INSTALL STATS
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {/* 30-day stat */}
            <div
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '10px',
                padding: '16px 20px',
                minWidth: '110px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <span
                style={{
                  fontSize: '0.6875rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-faint)',
                }}
              >
                30 days
              </span>
              <span
                style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: '#9581ff',
                }}
              >
                {formatInstallCount(c.install_30d)}
              </span>
            </div>

            {/* 90-day stat */}
            <div
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '10px',
                padding: '16px 20px',
                minWidth: '110px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <span
                style={{
                  fontSize: '0.6875rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-faint)',
                }}
              >
                90 days
              </span>
              <span
                style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: 'var(--color-text)',
                }}
              >
                {formatInstallCount(c.install_90d)}
              </span>
            </div>

            {/* 365-day stat */}
            <div
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '10px',
                padding: '16px 20px',
                minWidth: '110px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <span
                style={{
                  fontSize: '0.6875rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-faint)',
                }}
              >
                365 days
              </span>
              <span
                style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: 'var(--color-text)',
                }}
              >
                {formatInstallCount(c.install_365d)}
              </span>
            </div>
          </div>
        </div>

        {/* Metadata block */}
        <div>
          <p
            style={{
              fontSize: '0.6875rem',
              fontWeight: 400,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-text-faint)',
              marginBottom: '10px',
            }}
          >
            DETAILS
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Token row */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}>
              <span
                style={{
                  width: '80px',
                  flexShrink: 0,
                  fontSize: '0.6875rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-faint)',
                }}
              >
                Token
              </span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                <code
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.6875rem',
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '3px',
                    padding: '1px 5px',
                  }}
                >
                  {c.token}
                </code>
              </span>
            </div>

            {/* Version row */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}>
              <span
                style={{
                  width: '80px',
                  flexShrink: 0,
                  fontSize: '0.6875rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-faint)',
                }}
              >
                Version
              </span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                {c.version ?? '—'}
              </span>
            </div>

            {/* Updated row */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}>
              <span
                style={{
                  width: '80px',
                  flexShrink: 0,
                  fontSize: '0.6875rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-faint)',
                }}
              >
                Updated
              </span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                {new Date(c.last_synced_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>

            {/* Homepage row */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}>
              <span
                style={{
                  width: '80px',
                  flexShrink: 0,
                  fontSize: '0.6875rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-faint)',
                }}
              >
                Homepage
              </span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                {safeHomepage ? (
                  <a
                    href={safeHomepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--color-primary-hover)' }}
                  >
                    {domain || safeHomepage}
                  </a>
                ) : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
