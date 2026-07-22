import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { balanceCents, centsToReais, pointsBalance } from "@/lib/social";

export const dynamic = "force-dynamic";

// Catálogo da loja de cosméticos + situação do usuário logado (posses, saldo, pontos).
export async function GET() {
  const [items, me] = await Promise.all([
    prisma.storeItem.findMany({ where: { active: true }, orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] }),
    getSessionUser(),
  ]);

  let owned: Array<{ kind: string; itemId: string }> = [];
  let balance = 0;
  let points = 0;
  let equipped: { frame: string | null; accessory: string | null } | null = null;
  if (me) {
    const [userItems, bal, pts] = await Promise.all([
      prisma.userItem.findMany({ where: { userId: me.id }, select: { kind: true, itemId: true } }),
      balanceCents(me.id),
      pointsBalance(me.id),
    ]);
    owned = userItems;
    balance = bal;
    points = pts;
    equipped = { frame: me.frame, accessory: me.accessory };
  }

  return NextResponse.json({
    items: items.map((i) => ({
      id: i.id,
      kind: i.kind,
      itemId: i.itemId,
      name: i.name,
      price: centsToReais(i.priceCents),
      priceCents: i.priceCents,
      pointsPrice: i.pointsPrice,
      rarity: i.rarity,
    })),
    owned,
    balanceCents: balance,
    points,
    equipped,
  });
}
