import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCasksPageFiltered, getCasksCountFiltered, getCategories, PAGE_SIZE, searchCasks } from '@/lib/queries';
import { CaskGrid } from '@/components/cask-grid';
import { Pagination } from '@/components/pagination';
import { CategoryFilter } from '@/components/category-filter';
import { SortDropdown } from '@/components/sort-dropdown';
import { SEARCH_MIN_LENGTH, SEARCH_MAX_LENGTH } from '@/lib/search-constants';

export const metadata: Metadata = { title: 'Browse Casks — BrewIndex' };

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; category?: string; sort?: string }>;
}) {
  const { page: pageParam, q, category, sort } = await searchParams;

  // Search mode — branch taken when ?q is present and meets min length
  if (q && q.trim().length >= SEARCH_MIN_LENGTH) {
    const trimmed = q.trim().slice(0, SEARCH_MAX_LENGTH);
    const results = await searchCasks(trimmed);
    return (
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 24px 32px' }}>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
          {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{trimmed}&rdquo;
        </p>
        <CaskGrid casks={results} />
        {/* No <Pagination> in search mode — D-03 */}
      </main>
    );
  }

  // Normal paginated browse continues below
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);

  // Validate sort param against whitelist; fall back to 'popular'
  const sortKey = (sort === 'alphabetical' || sort === 'updated') ? sort : 'popular';

  const [pageCasks, totalCount, categories] = await Promise.all([
    getCasksPageFiltered({ category, sort: sortKey, page }),
    getCasksCountFiltered(category),
    getCategories(),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (page > totalPages && totalPages > 0) {
    redirect('/browse?page=' + totalPages);
  }

  return (
    <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 24px 32px' }}>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <CategoryFilter currentCategory={category} categories={categories} />
        <SortDropdown currentSort={sortKey} />
      </div>
      <CaskGrid casks={pageCasks} />
      <Pagination currentPage={page} totalPages={totalPages} />
    </main>
  );
}
