'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export function SearchInput() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(searchParams.get('q') ?? '');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when URL changes (browser back/forward)
  useEffect(() => {
    setValue(searchParams.get('q') ?? '');
  }, [searchParams]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setValue(v);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (v.trim().length >= MIN_QUERY_LENGTH) {
          params.set('q', v.trim());
          params.delete('page');
        } else {
          params.delete('q');
          params.delete('page');
        }
        router.replace(
          pathname + (params.toString() ? '?' + params.toString() : ''),
          { scroll: false }
        );
      }, DEBOUNCE_MS);
    },
    [searchParams, router, pathname]
  );

  return (
    <input
      type="text"
      value={value}
      onChange={handleChange}
      placeholder="Search casks…"
      style={{
        flex: 1,
        maxWidth: '480px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '8px 12px',
        color: 'var(--color-text)',
        fontSize: '0.8125rem',
        outline: 'none',
      }}
    />
  );
}
