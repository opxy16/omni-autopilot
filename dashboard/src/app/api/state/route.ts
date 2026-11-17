import { NextResponse } from "next/server";
import { getDashState } from "@/lib/state";
import { previewState } from "@/lib/preview";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

let inflight: Promise<unknown> | null = null;
let last: { at: number; body: unknown } | null = null;

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("preview") === "1") {
    return NextResponse.json(previewState());
  }
  // collapse concurrent requests and serve a 3 s micro-cache
  if (last && Date.now() - last.at < 3000) return NextResponse.json(last.body);
  try {
    inflight ??= getDashState().finally(() => (inflight = null));
    const body = await inflight;
    last = { at: Date.now(), body };
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
