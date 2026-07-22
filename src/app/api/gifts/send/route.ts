import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { balanceCents, centsToReais, getSettingNumber, pointsBalance } from "@/lib/social";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  recipientSlug: z.string().trim().min(1).max(40),
  giftItemId: z.string().trim().max(60).optional(),
  giftName: z.string().trim().max(120).optional(),
  message: z.string().trim().max(300).optional(),
  torpedo: z.boolean().optional(),
});

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

// Envia um presente (pago com o saldo da carteira) ou um Torpedo (mensagem grátis).
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para enviar presentes." }, { status: 401 });
  if (!rateLimit(`gift:${user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Muitos envios. Aguarde um pouco." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira os campos e tente novamente." }, { status: 400 });
  const { recipientSlug, giftItemId, giftName, message, torpedo } = parsed.data;

  const receiver = await prisma.user.findUnique({
    where: { slug: recipientSlug.toLowerCase() },
    select: { id: true, slug: true, name: true },
  });
  if (!receiver) return NextResponse.json({ error: "Destinatário não encontrado." }, { status: 404 });
  if (receiver.id === user.id) {
    return NextResponse.json({ error: "Você não pode presentear a si mesmo." }, { status: 400 });
  }

  // Resolve o item do catálogo (por id, por nome exato ou por nome normalizado).
  let gift = null;
  if (torpedo) {
    gift = await prisma.giftItem.findUnique({ where: { name: "Torpedo" } });
  } else if (giftItemId) {
    gift = await prisma.giftItem.findUnique({ where: { id: giftItemId } });
  } else if (giftName) {
    gift = await prisma.giftItem.findUnique({ where: { name: giftName } });
    if (!gift) {
      const all = await prisma.giftItem.findMany({ where: { active: true } });
      gift = all.find((g) => norm(g.name) === norm(giftName)) || null;
    }
  }
  if (!gift || !gift.active) return NextResponse.json({ error: "Presente não encontrado." }, { status: 404 });

  const isTorpedo = gift.priceCents === 0;
  if (isTorpedo && !message) {
    return NextResponse.json({ error: "Escreva a mensagem do torpedo." }, { status: 400 });
  }

  // Presente pago: debita o saldo do remetente e credita o destinatário
  // já com a taxa de serviço descontada (o preço mostrado inclui a taxa).
  if (!isTorpedo) {
    const balance = await balanceCents(user.id);
    if (balance < gift.priceCents) {
      return NextResponse.json(
        {
          error: `Saldo insuficiente. Você tem R$ ${centsToReais(balance).toFixed(2).replace(".", ",")} e o presente custa R$ ${centsToReais(gift.priceCents).toFixed(2).replace(".", ",")}. Deposite na carteira para continuar.`,
          code: "insufficient_balance",
          balanceCents: balance,
          priceCents: gift.priceCents,
        },
        { status: 402 }
      );
    }
  }

  const feePercent = await getSettingNumber("fee_percent");
  const creditedCents = isTorpedo ? 0 : Math.round((gift.priceCents * (100 - feePercent)) / 100);
  const pointsPerGift = await getSettingNumber("points_per_gift");
  const missionBonus = await getSettingNumber("points_mission_bonus");

  const result = await prisma.$transaction(async (tx) => {
    const sent = await tx.giftSent.create({
      data: {
        giftItemId: gift.id,
        senderId: user.id,
        receiverId: receiver.id,
        message: message || null,
        valueCents: gift.priceCents,
      },
    });

    if (!isTorpedo) {
      await tx.walletEntry.create({
        data: { userId: user.id, type: "GIFT_SENT", amountCents: -gift.priceCents, reference: `gift:${sent.id}` },
      });
      await tx.walletEntry.create({
        data: { userId: receiver.id, type: "GIFT_RECEIVED", amountCents: creditedCents, reference: `gift:${sent.id}` },
      });

      // Se o destinatário tem uma meta (BDAY) ativa, o presente conta como contribuição.
      const goal = await tx.goal.findFirst({ where: { userId: receiver.id, active: true } });
      if (goal) {
        await tx.goalContribution.create({
          data: { goalId: goal.id, userId: user.id, amountCents: creditedCents },
        });
      }

      // Gamificação: pontos por envio + bônus da missão semanal (3 envios).
      await tx.pointEntry.create({
        data: { userId: user.id, delta: pointsPerGift, reason: `envio:${gift.name}` },
      });
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const weekCount = await tx.giftSent.count({
        where: { senderId: user.id, createdAt: { gte: weekAgo }, valueCents: { gt: 0 } },
      });
      if (weekCount === 3 && missionBonus > 0) {
        await tx.pointEntry.create({
          data: { userId: user.id, delta: missionBonus, reason: "missao:3-envios-semana" },
        });
      }
    }
    return sent;
  });

  const [newBalance, points] = await Promise.all([balanceCents(user.id), pointsBalance(user.id)]);
  return NextResponse.json(
    {
      ok: true,
      giftSentId: result.id,
      gift: { name: gift.name, price: centsToReais(gift.priceCents) },
      credited: centsToReais(creditedCents),
      balanceCents: newBalance,
      points,
      torpedo: isTorpedo,
    },
    { status: 201 }
  );
}
