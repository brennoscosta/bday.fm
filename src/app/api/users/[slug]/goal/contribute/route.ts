import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { balanceCents, centsToReais, getSettingNumber, notify } from "@/lib/social";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  amount: z.number().positive().max(100_000), // em reais
  message: z.string().trim().max(300).optional(),
});

// Contribui em dinheiro para a meta (BDAY) de outro usuário, pagando com o saldo.
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para contribuir." }, { status: 401 });
  if (!rateLimit(`contribute:${user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Muitas contribuições. Aguarde um pouco." }, { status: 429 });
  }

  const { slug } = await ctx.params;
  const target = await prisma.user.findUnique({
    where: { slug: slug.toLowerCase() },
    select: { id: true, name: true },
  });
  if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  if (target.id === user.id) {
    return NextResponse.json({ error: "Você não pode contribuir para a própria meta." }, { status: 400 });
  }

  const goal = await prisma.goal.findFirst({ where: { userId: target.id, active: true } });
  if (!goal) return NextResponse.json({ error: "Este usuário não tem uma meta ativa." }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira o valor e tente novamente." }, { status: 400 });
  const amountCents = Math.round(parsed.data.amount * 100);

  const balance = await balanceCents(user.id);
  if (balance < amountCents) {
    return NextResponse.json(
      {
        error: `Saldo insuficiente. Você tem R$ ${centsToReais(balance).toFixed(2).replace(".", ",")}. Deposite na carteira para continuar.`,
        code: "insufficient_balance",
      },
      { status: 402 }
    );
  }

  const feePercent = await getSettingNumber("fee_percent");
  const creditedCents = Math.round((amountCents * (100 - feePercent)) / 100);

  await prisma.$transaction(async (tx) => {
    const contribution = await tx.goalContribution.create({
      data: { goalId: goal.id, userId: user.id, amountCents: creditedCents },
    });
    await tx.walletEntry.create({
      data: { userId: user.id, type: "GIFT_SENT", amountCents: -amountCents, reference: `goal:${contribution.id}` },
    });
    await tx.walletEntry.create({
      data: { userId: target.id, type: "GIFT_RECEIVED", amountCents: creditedCents, reference: `goal:${contribution.id}` },
    });
  });

  await notify(prisma, target.id, "GOAL_CONTRIBUTION", user.id, {
    amount: centsToReais(creditedCents),
    goalTitle: goal.title,
  });

  const [current, newBalance] = await Promise.all([
    prisma.goalContribution.aggregate({ where: { goalId: goal.id }, _sum: { amountCents: true } }),
    balanceCents(user.id),
  ]);
  return NextResponse.json(
    {
      ok: true,
      goal: {
        id: goal.id,
        title: goal.title,
        target: centsToReais(goal.targetCents),
        current: centsToReais(current._sum.amountCents || 0),
      },
      credited: centsToReais(creditedCents),
      balanceCents: newBalance,
    },
    { status: 201 }
  );
}
