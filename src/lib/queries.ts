import { unstable_cache } from 'next/cache';
import { db } from '@/db';
import { casks, type CaskSelectRow } from '@/db/schema';
import { and, desc, asc, eq, sql } from 'drizzle-orm';

/** Number of casks per page — single source of truth shared with browse/page.tsx. */
export const PAGE_SIZE = 48;

/** Returns a page of active casks ordered by 365-day install count descending. */
export const getCasksPage = unstable_cache(
  async (page: number) => {
    const offset = (page - 1) * PAGE_SIZE;
    return db
      .select()
      .from(casks)
      .where(eq(casks.is_active, true))
      .orderBy(desc(casks.install_365d))
      .limit(PAGE_SIZE)
      .offset(offset);
  },
  ['casks-page'],
  { tags: ['casks'] }
);

/** Returns the total count of active casks. */
export const getCasksCount = unstable_cache(
  async () => {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(casks)
      .where(eq(casks.is_active, true));
    return result[0]?.count ?? 0;
  },
  ['casks-count'],
  { tags: ['casks'] }
);

/** Returns a single active cask by token, or null if not found. */
export const getCaskByToken = unstable_cache(
  async (token: string) => {
    const result = await db
      .select()
      .from(casks)
      .where(and(eq(casks.is_active, true), eq(casks.token, token)))
      .limit(1);
    return result[0] ?? null;
  },
  ['cask-by-token'],
  { tags: ['casks'] }
);

/** Returns the top 500 active cask tokens ordered by 365-day install count descending. */
export const getTop500Tokens = unstable_cache(
  async () => {
    return db
      .select({ token: casks.token })
      .from(casks)
      .where(eq(casks.is_active, true))
      .orderBy(desc(casks.install_365d))
      .limit(500);
  },
  ['top-500-tokens'],
  { tags: ['casks'] }
);

/** Result cap for full-text search — single source of truth. */
export const SEARCH_RESULT_CAP = 50;

/** Full-text search over cask name + description using tsvector/GIN index.
 *  NOT cached — search results must be fresh per query.
 */
export async function searchCasks(q: string): Promise<CaskSelectRow[]> {
  return db
    .select()
    .from(casks)
    .where(
      and(
        eq(casks.is_active, true),
        sql`${casks.search_vector} @@ plainto_tsquery('english', ${q})`
      )
    )
    .orderBy(
      sql`ts_rank(${casks.search_vector}, plainto_tsquery('english', ${q})) DESC`,
      desc(casks.install_365d)
    )
    .limit(SEARCH_RESULT_CAP);
}

/** Returns a page of active casks with optional category filter and dynamic sort order.
 *  Sort options: 'popular' (365d install DESC), 'alphabetical' (name ASC), 'updated' (last_synced_at DESC).
 */
export const getCasksPageFiltered = unstable_cache(
  async (opts: { category?: string; sort: 'popular' | 'alphabetical' | 'updated'; page: number }) => {
    const { category, sort, page } = opts;
    const offset = (page - 1) * PAGE_SIZE;

    // Build WHERE conditions array — only add category filter if defined
    const conditions: ReturnType<typeof eq>[] = [eq(casks.is_active, true)];
    if (category) {
      conditions.push(eq(casks.category, category));
    }

    // Build dynamic ORDER BY clause
    const orderClause =
      sort === 'alphabetical' ? asc(casks.name) :
      sort === 'updated' ? desc(casks.last_synced_at) :
      desc(casks.install_365d); // default: 'popular'

    return db
      .select()
      .from(casks)
      .where(and(...conditions))
      .orderBy(orderClause)
      .limit(PAGE_SIZE)
      .offset(offset);
  },
  ['casks-filtered'],
  { tags: ['casks'] }
);

/** Returns the count of active casks with optional category filter — for pagination. */
export const getCasksCountFiltered = unstable_cache(
  async (category?: string) => {
    const conditions: ReturnType<typeof eq>[] = [eq(casks.is_active, true)];
    if (category) {
      conditions.push(eq(casks.category, category));
    }
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(casks)
      .where(and(...conditions));
    return result[0]?.count ?? 0;
  },
  ['casks-count-filtered'],
  { tags: ['casks'] }
);

/** Returns distinct non-null categories for populating the category filter UI. */
export const getCategories = unstable_cache(
  async () => {
    return db
      .selectDistinct({ category: casks.category })
      .from(casks)
      .where(and(eq(casks.is_active, true), sql`${casks.category} IS NOT NULL`))
      .orderBy(asc(casks.category));
  },
  ['categories'],
  { tags: ['casks'] }
);
