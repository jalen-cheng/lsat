import { NextRequest, NextResponse } from "next/server";
import { parseDump } from "@/lib/parser";
import { classify } from "@/lib/classify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Parse + classify a raw paste WITHOUT saving, so the Manage page can show an
// editable preview before committing.
export async function POST(req: NextRequest) {
  const { raw } = (await req.json()) as { raw?: string };
  if (!raw || !raw.trim()) {
    return NextResponse.json({ questions: [] });
  }
  const parsed = parseDump(raw);
  const questions = parsed.map((q) => ({
    ...q,
    qtype: classify(q.stem, q.stimulus),
  }));
  return NextResponse.json({ questions });
}
