export default function CaskLoading() {
  return (
    <main
      className="animate-pulse"
      style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px 48px' }}
    >
      {/* Back nav skeleton — matches inline-flex link: padding:6px 10px, fontSize:0.8125rem → ~31px */}
      <div style={{ paddingTop: '20px' }}>
        <div
          style={{
            height: 31,
            width: 130,
            borderRadius: 6,
            background: 'var(--color-border)',
          }}
        />
      </div>

      {/* Hero skeleton */}
      <div
        style={{
          borderBottom: '1px solid var(--color-border)',
          padding: '40px 0 32px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '24px',
        }}
      >
        {/* Icon skeleton */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 18,
            background: 'var(--color-border)',
            flexShrink: 0,
          }}
        />

        {/* Hero body — matches page.tsx: flex column, no gap, margin-based spacing */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
          }}
        >
          {/* h1 — fontSize:2rem lineHeight:1.1 → ~35px */}
          <div
            style={{
              height: 35,
              width: '40%',
              borderRadius: 6,
              background: 'var(--color-border)',
            }}
          />

          {/* Version/date line — fontSize:0.6875rem, marginTop:4px → 11px */}
          <div
            style={{
              height: 11,
              width: '30%',
              borderRadius: 4,
              background: 'var(--color-border)',
              marginTop: '4px',
            }}
          />

          {/* Description — fontSize:1rem lineHeight:1.5 ~2 lines → ~48px, marginTop:12px */}
          <div
            style={{
              height: 48,
              width: '80%',
              borderRadius: 4,
              background: 'var(--color-border)',
              marginTop: '12px',
            }}
          />

          {/* Links row placeholder — marginTop:16px, height matches link button */}
          <div
            style={{
              height: 29,
              width: 100,
              borderRadius: 6,
              background: 'var(--color-border)',
              marginTop: '16px',
            }}
          />
        </div>
      </div>

      {/* Install block skeleton */}
      <div style={{ marginTop: '32px' }}>
        {/* Label line */}
        <div
          style={{
            height: 11,
            width: 60,
            borderRadius: 4,
            background: 'var(--color-border)',
            marginBottom: '10px',
          }}
        />

        {/* Code block — padding:12px 16px + fontSize:0.8125rem lineHeight:1.5 → ~43px */}
        <div
          style={{
            height: 43,
            maxWidth: 640,
            borderRadius: 10,
            background: 'var(--color-border)',
          }}
        />
      </div>

      {/* Stats row skeleton */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          marginTop: '32px',
        }}
      >
        {['30d', '90d', '365d'].map((period) => (
          <div
            key={period}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: '16px 20px',
              minWidth: 110,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {/* Label */}
            <div
              style={{
                height: 10,
                width: 40,
                borderRadius: 4,
                background: 'var(--color-border)',
              }}
            />
            {/* Number */}
            <div
              style={{
                height: 18,
                width: 60,
                borderRadius: 4,
                background: 'var(--color-border)',
              }}
            />
          </div>
        ))}
      </div>
    </main>
  );
}
