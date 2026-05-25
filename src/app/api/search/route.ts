import { NextRequest } from 'next/server';
import { searchCasks } from '@/lib/queries';
import { z } from 'zod';

const QuerySchema = z.object({
  q: z.string().min(2).max(100),
});

export async function GET(request: NextRequest) {
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
