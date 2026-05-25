import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCasksPage, getCasksCount, PAGE_SIZE, searchCasks } from '@/lib/queries';
import { CaskGrid } from '@/components/cask-grid';
import { Pagination } from '@/components/pagination';

export const metadata: Metadata = { title: 'Browse Casks — BrewIndex' };

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { page: pageParam, q } = await searchParams;

  // Search mode — branch taken when ?q is present and meets min length
  if (q && q.trim().length >= 2) {
    const results = await searchCasks(q.trim());
    return (
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 24px 32px' }}>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
          {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{q.trim()}&rdquo;
        </p>
        <CaskGrid casks={results} />
        {/* No <Pagination> in search mode — D-03 */}
      </main>
    );
  }

  // Normal paginated browse continues below
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);

  const [pageCasks, totalCount] = await Promise.all([getCasksPage(page), getCasksCount()]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (page > totalPages && totalPages > 0) {
    redirect('/browse?page=' + totalPages);
  }

  return (
    <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 24px 32px' }}>
      <CaskGrid casks={pageCasks} />
      <Pagination currentPage={page} totalPages={totalPages} />
    </main>
  );
}
