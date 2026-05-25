export default function CaskLoading() {
  return (
    <main
      className="animate-pulse"
      style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px 48px' }}
    >
      {/* Back nav skeleton */}
      <div style={{ paddingTop: '20px' }}>
        <div
          style={{
            height: 30,
            width: 120,
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

        {/* Hero body */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            flex: 1,
            paddingTop: '4px',
          }}
        >
          {/* h1 skeleton */}
          <div
            style={{
              height: 36,
              width: '40%',
              borderRadius: 6,
              background: 'var(--color-border)',
            }}
          />

          {/* Version/date line */}
          <div
            style={{
              height: 12,
              width: '30%',
              borderRadius: 4,
              background: 'var(--color-border)',
            }}
          />

          {/* Description line 1 */}
          <div
            style={{
              height: 16,
              width: '80%',
              borderRadius: 4,
              background: 'var(--color-border)',
            }}
          />

          {/* Description line 2 */}
          <div
            style={{
              height: 16,
              width: '65%',
              borderRadius: 4,
              background: 'var(--color-border)',
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

        {/* Code block */}
        <div
          style={{
            height: 48,
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
