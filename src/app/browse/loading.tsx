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
              alignItems: 'flex-start',
              gap: '16px',
              padding: '20px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '14px',
            }}
          >
            {/* Icon skeleton — matches CaskIcon size={52} */}
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
              {/* Name + version row — fontSize:1rem fontWeight:700, lineHeight ~1.5 → 24px */}
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div
                  style={{
                    height: 24,
                    borderRadius: 4,
                    background: 'var(--color-border)',
                    flex: 1,
                    maxWidth: '55%',
                  }}
                />
                <div
                  style={{
                    height: 11,
                    width: 36,
                    borderRadius: 4,
                    background: 'var(--color-border)',
                    flexShrink: 0,
                    marginLeft: 'auto',
                  }}
                />
              </div>

              {/* Description — <p> at 0.8125rem × lineHeight 1.5 × 2 lines → ~39px */}
              <div
                style={{
                  height: 39,
                  borderRadius: 4,
                  background: 'var(--color-border)',
                  width: '90%',
                }}
              />

              {/* Metadata strip — gap:12px matching CaskCard */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 4 }}>
                {/* Installs pill — padding:2px 8px + fontSize:0.6875rem + border → ~22px */}
                <div
                  style={{
                    height: 22,
                    width: 80,
                    borderRadius: 9999,
                    background: 'var(--color-border)',
                  }}
                />
                {/* Platform pill */}
                <div
                  style={{
                    height: 22,
                    width: 52,
                    borderRadius: 9999,
                    background: 'var(--color-border)',
                  }}
                />
                {/* Token — marginLeft:auto */}
                <div
                  style={{
                    height: 11,
                    width: 60,
                    borderRadius: 4,
                    background: 'var(--color-border)',
                    marginLeft: 'auto',
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
