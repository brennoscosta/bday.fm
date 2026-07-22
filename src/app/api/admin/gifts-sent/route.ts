import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { centsToReais } from "@/lib/social";

export const dynamic = "force-dynamic";

// Admin: histórico de envios de presentes (inclui torpedos).
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sent = await prisma.giftSent.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      sender: { select: { slug: true, name: true } },
      receiver: { select: { slug: true, name: true } },
      giftItem: { select: { name: true, emoji: true, physical: true, partner: true } },
    },
  });
  return NextResponse.json({
    sent: sent.map((g) => ({
      id: g.id,
      gift: g.giftItem.name,
      emoji: g.giftItem.emoji,
      physical: g.giftItem.physical,
      partner: g.giftItem.partner,
      from: g.sender.name,
      fromSlug: g.sender.slug,
      to: g.receiver.name,
      toSlug: g.receiver.slug,
      value: centsToReais(g.valueCents),
      message: g.message,
      createdAt: g.createdAt,
    })),
  });
}
