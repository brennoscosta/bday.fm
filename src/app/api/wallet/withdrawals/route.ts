import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { centsToReais } from "@/lib/social";

export const dynamic = "force-dynamic";

// Lista os saques do usuário logado (aba "Saques" da carteira).
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const withdrawals = await prisma.withdrawal.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      amount: centsToReais(w.amountCents),
      amountCents: w.amountCents,
      fee: centsToReais(w.feeCents),
      net: centsToReais(w.netCents),
      speed: w.speed,
      status: w.status,
      pixKeyType: w.pixKeyType,
      createdAt: w.createdAt,
    })),
    pixKey: user.pixKey,
    pixKeyType: user.pixKeyType,
  });
}
