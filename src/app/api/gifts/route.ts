import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { centsToReais } from "@/lib/social";

export const dynamic = "force-dynamic";

// Catálogo público de presentes (virtuais e físicos), com contagem real de envios.
export async function GET() {
  const [items, sentCounts] = await Promise.all([
    prisma.giftItem.findMany({
      where: { active: true, NOT: { category: "torpedo" } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.giftSent.groupBy({ by: ["giftItemId"], _count: { _all: true } }),
  ]);
  const countMap = new Map(sentCounts.map((r) => [r.giftItemId, r._count._all]));

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
      sentCount: g.baseSentCount + (countMap.get(g.id) || 0),
    })),
  });
}
