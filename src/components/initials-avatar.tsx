import { getInitialsColor, getInitials } from '@/lib/hash';

export function InitialsAvatar({ token, size }: { token: string; size: number }) {
  const borderRadius = size >= 72 ? '18px' : '10px';
  const fontSize = size >= 72 ? 30 : 18;

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius,
        background: getInitialsColor(token),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          color: 'white',
          fontWeight: 700,
          fontSize: `${fontSize}px`,
          userSelect: 'none',
        }}
      >
        {getInitials(token)}
      </span>
    </div>
  );
}
