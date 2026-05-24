'use client';

import { useState, useRef, useEffect } from 'react';

export function CopyButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      await navigator.clipboard.writeText('brew install --cask ' + token);
      setState('copied');
    } catch {
      setState('failed');
    }
    timerRef.current = setTimeout(() => setState('idle'), 2000);
  }

  const label =
    state === 'copied' ? 'Copied!' : state === 'failed' ? 'Failed' : 'Copy';
  const bgColor =
    state === 'copied'
      ? '#4ade80'
      : state === 'failed'
        ? 'var(--color-danger)'
        : '#7c6aff';
  const textColor = state === 'copied' ? '#0a0a0a' : 'white';

  return (
    <button
      onClick={handleCopy}
      style={{
        background: bgColor,
        color: textColor,
        border: 'none',
        borderRadius: '6px',
        padding: '7px 16px',
        fontSize: '0.8125rem',
        fontWeight: 700,
        minWidth: '80px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}
