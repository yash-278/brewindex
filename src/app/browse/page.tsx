import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCasksPage, getCasksCount, PAGE_SIZE } from '@/lib/queries';
import { CaskGrid } from '@/components/cask-grid';
import { Pagination } from '@/components/pagination';

export const metadata: Metadata = { title: 'Browse Casks — BrewIndex' };

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
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
