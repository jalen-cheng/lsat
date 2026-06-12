import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Edit a banked question's type and/or difficulty override.
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = (await req.json()) as {
    qtype?: string;
    difficulty?: number | null;
  };
  const d = db();
  if (typeof body.qtype === "string") {
    d.prepare("UPDATE questions SET qtype = ? WHERE id = ?").run(body.qtype, Number(id));
  }
  if (body.difficulty === null || typeof body.difficulty === "number") {
    d.prepare("UPDATE questions SET difficulty = ? WHERE id = ?").run(
      body.difficulty,
      Number(id),
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  db().prepare("DELETE FROM questions WHERE id = ?").run(Number(id));
  return NextResponse.json({ ok: true });
}
