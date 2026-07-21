import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Carteira REAL do usuário logado: saldo (soma do ledger) + últimas transações.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [agg, entries] = await Promise.all([
    prisma.walletEntry.aggregate({ _sum: { amountCents: true }, where: { userId: user.id } }),
    prisma.walletEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, type: true, amountCents: true, reference: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    balanceCents: agg._sum.amountCents || 0,
    entries,
    mercadoPago: { configured: !!process.env.MP_ACCESS_TOKEN },
  });
}
