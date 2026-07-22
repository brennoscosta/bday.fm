import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  status: z.enum(["PROCESSING", "DONE", "FAILED", "REJECTED"]),
  adminNote: z.string().trim().max(300).optional().nullable(),
});

// Admin: atualiza o status de um saque. FAILED/REJECTED estornam o valor
// para o saldo do usuário (uma única vez, via lançamento idempotente).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!rateLimit(`admin-withdraw:${admin.id}`, 60, 60_000)) {
    return NextResponse.json({ error: "rate" }, { status: 429 });
  }

  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { status, adminNote } = parsed.data;

  const withdrawal = await prisma.withdrawal.findUnique({ where: { id } });
  if (!withdrawal) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (withdrawal.status === "DONE" && status !== "DONE") {
    return NextResponse.json({ error: "Saque já concluído não pode mudar de status." }, { status: 409 });
  }

  const shouldRefund = (status === "FAILED" || status === "REJECTED") &&
    withdrawal.status !== "FAILED" && withdrawal.status !== "REJECTED";

  const updated = await prisma.$transaction(async (tx) => {
    if (shouldRefund) {
      const refundRef = `withdraw-refund:${withdrawal.id}`;
      const already = await tx.walletEntry.findFirst({ where: { reference: refundRef } });
      if (!already) {
        await tx.walletEntry.create({
          data: {
            userId: withdrawal.userId,
            type: "ADJUSTMENT",
            amountCents: withdrawal.amountCents,
            reference: refundRef,
          },
        });
      }
    }
    return tx.withdrawal.update({
      where: { id },
      data: { status, adminNote: adminNote ?? withdrawal.adminNote },
    });
  });

  return NextResponse.json({ withdrawal: { id: updated.id, status: updated.status, adminNote: updated.adminNote } });
}
