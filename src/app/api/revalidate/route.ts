import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  // CRON_SECRET guard — must be first, before any work
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidateTag("casks");
  revalidateTag("max");

  return Response.json({ revalidated: true, now: Date.now() });
}
