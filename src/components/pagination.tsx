import Link from 'next/link';

export function Pagination({
  currentPage,
  totalPages,
}: {
  currentPage: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  // Build the page window: always include page 1 and totalPages, show ±3 around current
  const windowSet = new Set<number>();
  windowSet.add(1);
  windowSet.add(totalPages);
  for (let i = Math.max(1, currentPage - 3); i <= Math.min(totalPages, currentPage + 3); i++) {
    windowSet.add(i);
  }

  // Sort and insert ellipsis where there are gaps > 1
  const sortedPages = Array.from(windowSet).sort((a, b) => a - b);
  const items: (number | '...')[] = [];
  for (let i = 0; i < sortedPages.length; i++) {
    if (i > 0 && sortedPages[i] - sortedPages[i - 1] > 1) {
      items.push('...');
    }
    items.push(sortedPages[i]);
  }

  const pageButtonBase: React.CSSProperties = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '0.8125rem',
    color: 'var(--color-text-muted)',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  };

  const pageButtonActive: React.CSSProperties = {
    ...pageButtonBase,
    background: 'var(--color-primary-dim)',
    borderColor: 'var(--color-primary)',
    color: 'var(--color-primary-hover)',
  };

  const navButtonBase: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: '0.8125rem',
    color: 'var(--color-text-muted)',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  };

  const disabledNav: React.CSSProperties = {
    ...navButtonBase,
    opacity: 0.4,
    cursor: 'not-allowed',
    pointerEvents: 'none',
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          marginTop: '24px',
          flexWrap: 'wrap',
        }}
      >
        {/* ← Prev */}
        {currentPage === 1 ? (
          <span style={disabledNav}>← Prev</span>
        ) : (
          <Link href={`?page=${currentPage - 1}`} style={navButtonBase}>
            ← Prev
          </Link>
        )}

        {/* Page number buttons */}
        {items.map((item, idx) =>
          item === '...' ? (
            <span
              key={`ellipsis-${idx}`}
              style={{
                color: 'var(--color-text-faint)',
                padding: '6px 4px',
                fontSize: '0.8125rem',
              }}
            >
              …
            </span>
          ) : (
            <Link
              key={item}
              href={`?page=${item}`}
              style={item === currentPage ? pageButtonActive : pageButtonBase}
            >
              {item}
            </Link>
          )
        )}

        {/* Next → */}
        {currentPage === totalPages ? (
          <span style={disabledNav}>Next →</span>
        ) : (
          <Link href={`?page=${currentPage + 1}`} style={navButtonBase}>
            Next →
          </Link>
        )}
      </div>

      {/* Page label */}
      <div
        style={{
          textAlign: 'center',
          marginTop: '8px',
          fontSize: '0.8125rem',
          color: 'var(--color-text-faint)',
        }}
      >
        Page {currentPage} of {totalPages}
      </div>
    </div>
  );
}
