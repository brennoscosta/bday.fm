import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ status: z.enum(["OPEN", "PENDING", "CLOSED"]) });

// Admin: muda o status de um chamado.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!rateLimit(`admin-support:${admin.id}`, 60, 60_000)) {
    return NextResponse.json({ error: "rate" }, { status: 429 });
  }

  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const updated = await prisma.supportTicket.update({ where: { id }, data: { status: parsed.data.status } });
  return NextResponse.json({ ticket: { id: updated.id, status: updated.status } });
}
