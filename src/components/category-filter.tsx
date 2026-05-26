'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

export function CategoryFilter({
  currentCategory,
  categories,
}: {
  currentCategory?: string;
  categories: { category: string | null }[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  function setCategory(cat: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (cat) {
      params.set('category', cat);
    } else {
      params.delete('category');
    }
    params.delete('page'); // Reset to page 1 when filtering
    router.replace(
      pathname + (params.toString() ? '?' + params.toString() : ''),
      { scroll: false }
    );
  }

  const isActive = (cat: string | null) =>
    cat === null ? !currentCategory : currentCategory === cat;

  const pillBase: React.CSSProperties = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '9999px',
    padding: '6px 16px',
    fontSize: '0.9375rem',
    fontWeight: 500,
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  };

  const pillActive: React.CSSProperties = {
    ...pillBase,
    background: 'var(--color-primary-dim)',
    borderColor: 'var(--color-primary)',
    color: 'var(--color-primary-hover)',
  };

  return (
    <div
      role="group"
      aria-label="Category filter"
      style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
    >
      <button
        onClick={() => setCategory(null)}
        style={isActive(null) ? pillActive : pillBase}
        aria-pressed={isActive(null)}
      >
        All Apps
      </button>
      {categories.map((c) => (
        <button
          key={c.category}
          onClick={() => setCategory(c.category)}
          style={isActive(c.category) ? pillActive : pillBase}
          aria-pressed={isActive(c.category)}
        >
          {c.category}
        </button>
      ))}
    </div>
  );
}
