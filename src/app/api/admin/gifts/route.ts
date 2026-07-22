import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { centsToReais } from "@/lib/social";

export const dynamic = "force-dynamic";

// Admin: lista completa do catálogo de presentes (inclui inativos).
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [items, sentCounts] = await Promise.all([
    prisma.giftItem.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.giftSent.groupBy({ by: ["giftItemId"], _count: { _all: true }, _sum: { valueCents: true } }),
  ]);
  const countMap = new Map(sentCounts.map((r) => [r.giftItemId, r]));
  return NextResponse.json({
    gifts: items.map((g) => ({
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      price: centsToReais(g.priceCents),
      priceCents: g.priceCents,
      description: g.description,
      category: g.category,
      rarity: g.rarity,
      physical: g.physical,
      partner: g.partner,
      baseSentCount: g.baseSentCount,
      sortOrder: g.sortOrder,
      active: g.active,
      realSentCount: countMap.get(g.id)?._count._all || 0,
      realSentTotal: centsToReais(countMap.get(g.id)?._sum.valueCents || 0),
    })),
  });
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  emoji: z.string().trim().max(8).optional().nullable(),
  price: z.number().min(0).max(100_000), // reais
  description: z.string().trim().max(300).optional().nullable(),
  category: z.string().trim().max(60).optional().nullable(),
  rarity: z.string().trim().max(30).optional().nullable(),
  physical: z.boolean().optional(),
  partner: z.string().trim().max(120).optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
});

// Admin: cria um presente no catálogo.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!rateLimit(`admin-gift:${admin.id}`, 60, 60_000)) {
    return NextResponse.json({ error: "rate" }, { status: 429 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { price, ...rest } = parsed.data;

  const exists = await prisma.giftItem.findUnique({ where: { name: rest.name } });
  if (exists) return NextResponse.json({ error: "Já existe um presente com esse nome." }, { status: 409 });

  const gift = await prisma.giftItem.create({
    data: { ...rest, priceCents: Math.round(price * 100) },
  });
  return NextResponse.json({ gift }, { status: 201 });
}
