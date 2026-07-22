import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { centsToReais } from "@/lib/social";

export const dynamic = "force-dynamic";

// Rankings do mês: quem mais enviou e quem mais recebeu presentes.
export async function GET() {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [givers, receivers] = await Promise.all([
    prisma.giftSent.groupBy({
      by: ["senderId"],
      where: { createdAt: { gte: startOfMonth }, valueCents: { gt: 0 } },
      _sum: { valueCents: true },
      orderBy: { _sum: { valueCents: "desc" } },
      take: 5,
    }),
    prisma.giftSent.groupBy({
      by: ["receiverId"],
      where: { createdAt: { gte: startOfMonth }, valueCents: { gt: 0 } },
      _sum: { valueCents: true },
      orderBy: { _sum: { valueCents: "desc" } },
      take: 5,
    }),
  ]);

  const ids = [...new Set([...givers.map((g) => g.senderId), ...receivers.map((r) => r.receiverId)])];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true, name: true, avatarUrl: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    givers: givers
      .map((g) => {
        const u = userMap.get(g.senderId);
        return u ? { slug: u.slug, name: u.name, avatarUrl: u.avatarUrl, total: centsToReais(g._sum.valueCents || 0) } : null;
      })
      .filter(Boolean),
    receivers: receivers
      .map((r) => {
        const u = userMap.get(r.receiverId);
        return u ? { slug: u.slug, name: u.name, avatarUrl: u.avatarUrl, total: centsToReais(r._sum.valueCents || 0) } : null;
      })
      .filter(Boolean),
  });
}
