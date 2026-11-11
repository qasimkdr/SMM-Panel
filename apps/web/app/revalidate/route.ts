import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

/** Called by the API when the catalog or settings change, so ISR pages refresh immediately. */
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const { paths } = (await req.json().catch(() => ({}))) as { paths?: string[] };
  for (const p of paths?.length ? paths : ["/services"]) revalidatePath(p);
  return NextResponse.json({ ok: true });
}
