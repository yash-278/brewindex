import { NextRequest } from 'next/server';
import { searchCasks } from '@/lib/queries';
import { z } from 'zod';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { SEARCH_MIN_LENGTH, SEARCH_MAX_LENGTH } from '@/lib/search-constants';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, '10 s'),
});

const QuerySchema = z.object({
  q: z.string().min(SEARCH_MIN_LENGTH).max(SEARCH_MAX_LENGTH),
});

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? '127.0.0.1';
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  const raw = request.nextUrl.searchParams.get('q') ?? '';
  const parsed = QuerySchema.safeParse({ q: raw.trim() });
  if (!parsed.success) {
    return Response.json({ results: [] });
  }
  try {
    const results = await searchCasks(parsed.data.q);
    return Response.json({ results });
  } catch (err) {
    console.error('[api/search] error:', err);
    return Response.json({ error: 'Search failed' }, { status: 500 });
  }
}
