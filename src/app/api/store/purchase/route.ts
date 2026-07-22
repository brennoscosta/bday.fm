import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { balanceCents, centsToReais, pointsBalance } from "@/lib/social";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kind: z.enum(["frame", "accessory"]),
  itemId: z.string().trim().min(1).max(40),
  payWith: z.enum(["balance", "points"]).default("balance"),
  equip: z.boolean().default(true),
});

// Compra (com saldo ou pontos) um cosmético da loja e o equipa.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para comprar." }, { status: 401 });
  if (!rateLimit(`store:${user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Muitas compras. Aguarde um pouco." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const { kind, itemId, payWith, equip } = parsed.data;

  const item = await prisma.storeItem.findUnique({ where: { kind_itemId: { kind, itemId } } });
  if (!item || !item.active) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });

  const alreadyOwned = await prisma.userItem.findUnique({
    where: { userId_kind_itemId: { userId: user.id, kind, itemId } },
  });

  if (!alreadyOwned) {
    if (payWith === "balance") {
      const balance = await balanceCents(user.id);
      if (balance < item.priceCents) {
        return NextResponse.json(
          {
            error: `Saldo insuficiente. Você tem R$ ${centsToReais(balance).toFixed(2).replace(".", ",")} e o item custa R$ ${centsToReais(item.priceCents).toFixed(2).replace(".", ",")}.`,
            code: "insufficient_balance",
          },
          { status: 402 }
        );
      }
      await prisma.$transaction([
        prisma.walletEntry.create({
          data: { userId: user.id, type: "STORE_PURCHASE", amountCents: -item.priceCents, reference: `store:${item.id}` },
        }),
        prisma.userItem.create({ data: { userId: user.id, kind, itemId, source: "purchase" } }),
      ]);
    } else {
      if (!item.pointsPrice) {
        return NextResponse.json({ error: "Este item não pode ser resgatado com pontos." }, { status: 400 });
      }
      const points = await pointsBalance(user.id);
      if (points < item.pointsPrice) {
        return NextResponse.json(
          { error: `Pontos insuficientes. Você tem ${points} pts e o resgate custa ${item.pointsPrice} pts.`, code: "insufficient_points" },
          { status: 402 }
        );
      }
      await prisma.$transaction([
        prisma.pointEntry.create({
          data: { userId: user.id, delta: -item.pointsPrice, reason: `resgate:${item.id}` },
        }),
        prisma.userItem.create({ data: { userId: user.id, kind, itemId, source: "points" } }),
      ]);
    }
  }

  if (equip) {
    await prisma.user.update({
      where: { id: user.id },
      data: kind === "frame" ? { frame: itemId } : { accessory: itemId },
    });
  }

  const [newBalance, newPoints, userItems] = await Promise.all([
    balanceCents(user.id),
    pointsBalance(user.id),
    prisma.userItem.findMany({ where: { userId: user.id }, select: { kind: true, itemId: true } }),
  ]);
  return NextResponse.json({
    ok: true,
    alreadyOwned: !!alreadyOwned,
    balanceCents: newBalance,
    points: newPoints,
    owned: userItems,
  });
}
