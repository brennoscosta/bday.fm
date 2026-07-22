import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { centsToReais } from "@/lib/social";

export const dynamic = "force-dynamic";

// Admin: lista as solicitações de saque Pix (todas ou por status).
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const valid = ["REQUESTED", "PROCESSING", "DONE", "FAILED", "REJECTED"];

  const withdrawals = await prisma.withdrawal.findMany({
    where: status && valid.includes(status) ? { status: status as never } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { slug: true, name: true, email: true } } },
  });
  return NextResponse.json({
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      slug: w.user.slug,
      name: w.user.name,
      email: w.user.email,
      amount: centsToReais(w.amountCents),
      fee: centsToReais(w.feeCents),
      net: centsToReais(w.netCents),
      speed: w.speed,
      pixKey: w.pixKey,
      pixKeyType: w.pixKeyType,
      status: w.status,
      adminNote: w.adminNote,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    })),
  });
}
