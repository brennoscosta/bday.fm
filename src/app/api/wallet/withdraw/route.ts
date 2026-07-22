import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { balanceCents, centsToReais, getSettingNumber } from "@/lib/social";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  amount: z.number().positive().max(100_000), // em reais
  speed: z.enum(["standard", "instant"]).default("standard"),
  pixKey: z.string().trim().min(3).max(140),
  pixKeyType: z.enum(["cpf", "cnpj", "email", "phone", "random"]).default("cpf"),
});

// Solicita um saque Pix: debita o saldo imediatamente (evita gasto duplo)
// e cria a solicitação para processamento (aba Saques + painel admin).
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para sacar." }, { status: 401 });
  if (!rateLimit(`withdraw:${user.id}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Muitas solicitações. Aguarde um pouco." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Confira o valor e a chave Pix." }, { status: 400 });
  }
  const { amount, speed, pixKey, pixKeyType } = parsed.data;

  const minWithdraw = await getSettingNumber("min_withdraw_reais");
  if (amount < minWithdraw) {
    return NextResponse.json(
      { error: `O saque mínimo é R$ ${minWithdraw.toFixed(2).replace(".", ",")}.` },
      { status: 400 }
    );
  }

  const amountCents = Math.round(amount * 100);
  const instantFee = await getSettingNumber("instant_fee_percent");
  const feeCents = speed === "instant" ? Math.round((amountCents * instantFee) / 100) : 0;
  const netCents = amountCents - feeCents;

  const withdrawal = await prisma.$transaction(async (tx) => {
    // Revalida o saldo dentro da transação.
    const agg = await tx.walletEntry.aggregate({ where: { userId: user.id }, _sum: { amountCents: true } });
    const balance = agg._sum.amountCents || 0;
    if (balance < amountCents) {
      throw Object.assign(new Error("insufficient"), { code: "insufficient", balance });
    }
    const w = await tx.withdrawal.create({
      data: {
        userId: user.id,
        amountCents,
        feeCents,
        netCents,
        speed,
        pixKey,
        pixKeyType,
        status: "REQUESTED",
      },
    });
    await tx.walletEntry.create({
      data: { userId: user.id, type: "WITHDRAWAL_PIX", amountCents: -amountCents, reference: `withdraw:${w.id}` },
    });
    return w;
  }).catch((e: { code?: string; balance?: number }) => {
    if (e?.code === "insufficient") {
      return NextResponse.json(
        {
          error: `Saldo insuficiente. Disponível: R$ ${centsToReais(e.balance || 0).toFixed(2).replace(".", ",")}.`,
          code: "insufficient_balance",
        },
        { status: 402 }
      );
    }
    throw e;
  });

  if (withdrawal instanceof NextResponse) return withdrawal;

  // Guarda a chave Pix no cadastro para os próximos saques.
  await prisma.user.update({ where: { id: user.id }, data: { pixKey, pixKeyType } }).catch(() => {});

  const newBalance = await balanceCents(user.id);
  return NextResponse.json(
    {
      ok: true,
      withdrawal: {
        id: withdrawal.id,
        amount: centsToReais(withdrawal.amountCents),
        fee: centsToReais(withdrawal.feeCents),
        net: centsToReais(withdrawal.netCents),
        speed: withdrawal.speed,
        status: withdrawal.status,
        createdAt: withdrawal.createdAt,
      },
      balanceCents: newBalance,
    },
    { status: 201 }
  );
}
