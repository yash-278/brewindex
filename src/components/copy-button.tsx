'use client';

import { useState } from 'react';

export function CopyButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText('brew install --cask ' + token);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('failed');
      setTimeout(() => setState('idle'), 2000);
    }
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
