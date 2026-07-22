import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

// Lista REAL de usuários para o painel (inclui e-mail e papel — só para ADMIN).
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [users, balances] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true, slug: true, name: true, email: true, role: true,
        birthdate: true, createdAt: true, avatarUrl: true,
      },
    }),
    prisma.walletEntry.groupBy({ by: ["userId"], _sum: { amountCents: true } }),
  ]);

  const balanceMap = new Map(balances.map((b: any) => [b.userId, b._sum.amountCents || 0]));

  return NextResponse.json({
    users: users.map((u: any) => ({
      slug: u.slug,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      birthdayDayMonth: u.birthdate
        ? `${String(new Date(u.birthdate).getUTCDate()).padStart(2, "0")}/${String(new Date(u.birthdate).getUTCMonth() + 1).padStart(2, "0")}`
        : null,
      balanceCents: balanceMap.get(u.id) || 0,
    })),
  });
}
