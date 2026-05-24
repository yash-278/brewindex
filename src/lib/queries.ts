import { unstable_cache } from 'next/cache';
import { db } from '@/db';
import { casks } from '@/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';

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
