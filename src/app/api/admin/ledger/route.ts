import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { centsToReais } from "@/lib/social";

export const dynamic = "force-dynamic";

// Admin: extrato geral do ledger (movimentação da plataforma).
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const valid = ["DEPOSIT_MP", "GIFT_RECEIVED", "GIFT_SENT", "STORE_PURCHASE", "WITHDRAWAL_PIX", "ADJUSTMENT"];

  const entries = await prisma.walletEntry.findMany({
    where: type && valid.includes(type) ? { type: type as never } : undefined,
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { user: { select: { slug: true, name: true } } },
  });
  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      slug: e.user.slug,
      name: e.user.name,
      type: e.type,
      amount: centsToReais(e.amountCents),
      amountCents: e.amountCents,
      reference: e.reference,
      createdAt: e.createdAt,
    })),
  });
}
