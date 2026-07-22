import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    emoji: z.string().trim().max(8).nullable(),
    price: z.number().min(0).max(100_000), // reais
    description: z.string().trim().max(300).nullable(),
    category: z.string().trim().max(60).nullable(),
    rarity: z.string().trim().max(30).nullable(),
    physical: z.boolean(),
    partner: z.string().trim().max(120).nullable(),
    baseSentCount: z.number().int().min(0),
    sortOrder: z.number().int().min(0).max(9999),
    active: z.boolean(),
  })
  .partial();

// Admin: edita um presente do catálogo.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!rateLimit(`admin-gift:${admin.id}`, 60, 60_000)) {
    return NextResponse.json({ error: "rate" }, { status: 429 });
  }

  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { price, ...rest } = parsed.data;

  const gift = await prisma.giftItem.findUnique({ where: { id } });
  if (!gift) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const updated = await prisma.giftItem.update({
    where: { id },
    data: { ...rest, ...(price !== undefined ? { priceCents: Math.round(price * 100) } : {}) },
  });
  return NextResponse.json({ gift: updated });
}

// Admin: remove um presente (arquiva se já houve envios).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const sent = await prisma.giftSent.count({ where: { giftItemId: id } });
  if (sent > 0) {
    await prisma.giftItem.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ ok: true, archived: true });
  }
  await prisma.giftItem.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true, archived: false });
}
