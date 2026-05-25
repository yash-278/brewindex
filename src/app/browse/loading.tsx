export default function BrowseLoading() {
  return (
    <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 24px 32px' }}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse"
            style={{
              display: 'flex',
              gap: '16px',
              padding: '20px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '14px',
            }}
          >
            {/* Icon skeleton */}
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 10,
                background: 'var(--color-border)',
                flexShrink: 0,
                marginTop: 2,
              }}
            />

            {/* Text body */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {/* Name line */}
              <div
                style={{
                  height: 16,
                  borderRadius: 4,
                  background: 'var(--color-border)',
                  width: '55%',
                }}
              />

              {/* Description line 1 */}
              <div
                style={{
                  height: 13,
                  borderRadius: 4,
                  background: 'var(--color-border)',
                  width: '90%',
                }}
              />

              {/* Description line 2 */}
              <div
                style={{
                  height: 13,
                  borderRadius: 4,
                  background: 'var(--color-border)',
                  width: '70%',
                }}
              />

              {/* Metadata strip */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <div
                  style={{
                    height: 18,
                    width: 72,
                    borderRadius: 9999,
                    background: 'var(--color-border)',
                  }}
                />
                <div
                  style={{
                    height: 18,
                    width: 52,
                    borderRadius: 9999,
                    background: 'var(--color-border)',
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
