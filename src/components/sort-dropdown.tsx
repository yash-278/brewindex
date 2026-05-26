'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

const SORT_OPTIONS = {
  popular: 'Popular',
  alphabetical: 'A-Z',
  updated: 'Recently Updated',
} as const;

export function SortDropdown({ currentSort }: { currentSort: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', e.target.value);
    params.delete('page'); // Reset to page 1 when sorting changes
    router.replace(
      pathname + (params.toString() ? '?' + params.toString() : ''),
      { scroll: false }
    );
  }

  return (
    <select
      value={currentSort}
      onChange={handleChange}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '10px',
        padding: '6px 12px',
        fontSize: '0.9375rem',
        fontWeight: 500,
        color: 'var(--color-text)',
        cursor: 'pointer',
        outline: 'none',
      }}
      aria-label="Sort casks by"
    >
      {Object.entries(SORT_OPTIONS).map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}
