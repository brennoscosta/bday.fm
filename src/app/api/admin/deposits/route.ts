import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

// Depósitos REAIS (Mercado Pago) para o painel — ledger DEPOSIT_MP com o dono.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const entries = await prisma.walletEntry.findMany({
    where: { type: "DEPOSIT_MP" },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { slug: true, name: true } } },
  });

  return NextResponse.json({
    deposits: entries.map((e) => ({
      id: e.id,
      slug: e.user.slug,
      name: e.user.name,
      amountCents: e.amountCents,
      reference: e.reference,
      createdAt: e.createdAt,
    })),
  });
}
