import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

// Métricas REAIS do painel — tudo calculado do banco, nada fictício.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();

  const [totalUsers, newUsers7d, newUsers30d, giftsAgg, walletCredits, walletDebits, activeSessions] =
    await Promise.all([
      prisma.user.count({ where: { role: "USER" } }),
      prisma.user.count({ where: { role: "USER", createdAt: { gte: d7 } } }),
      prisma.user.count({ where: { role: "USER", createdAt: { gte: d30 } } }),
      prisma.giftSent.aggregate({ _count: { id: true }, _sum: { valueCents: true } }),
      prisma.walletEntry.aggregate({ _sum: { amountCents: true }, where: { amountCents: { gt: 0 } } }),
      prisma.walletEntry.aggregate({ _sum: { amountCents: true }, where: { amountCents: { lt: 0 } } }),
      prisma.session.count({ where: { expiresAt: { gt: now } } }),
    ]);

  const [bdayToday] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM "User"
    WHERE role = 'USER' AND birthdate IS NOT NULL
      AND EXTRACT(MONTH FROM birthdate) = ${month} AND EXTRACT(DAY FROM birthdate) = ${day}`;
  const [bdayMonth] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM "User"
    WHERE role = 'USER' AND birthdate IS NOT NULL AND EXTRACT(MONTH FROM birthdate) = ${month}`;

  const totalCredits = walletCredits._sum.amountCents || 0;
  const totalDebits = walletDebits._sum.amountCents || 0;

  return NextResponse.json({
    generatedAt: now.toISOString(),
    users: { total: totalUsers, new7d: newUsers7d, new30d: newUsers30d, activeSessions },
    birthdays: { today: Number(bdayToday?.n || 0), thisMonth: Number(bdayMonth?.n || 0) },
    gifts: { count: giftsAgg._count.id, totalCents: giftsAgg._sum.valueCents || 0 },
    wallet: {
      creditsCents: totalCredits,
      debitsCents: totalDebits,
      balanceCents: totalCredits + totalDebits,
    },
    mercadoPago: { configured: !!process.env.MP_ACCESS_TOKEN },
  });
}
