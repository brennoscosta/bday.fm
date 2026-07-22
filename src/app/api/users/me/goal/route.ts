import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { centsToReais } from "@/lib/social";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string().trim().min(2).max(120),
  target: z.number().positive().max(1_000_000), // em reais
  description: z.string().trim().max(500).optional().nullable(),
  category: z.string().trim().max(60).optional().nullable(),
  date: z.string().trim().max(40).optional().nullable(),
  image: z.string().max(900_000).optional().nullable(),
});

// Cria/edita a meta de grupo (BDAY) do usuário logado.
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  if (!rateLimit(`goal:${user.id}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Muitas alterações. Aguarde um pouco." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira os campos e tente novamente." }, { status: 400 });
  const { title, target, description, category, date, image } = parsed.data;

  const existing = await prisma.goal.findFirst({ where: { userId: user.id, active: true } });
  const data = {
    title,
    targetCents: Math.round(target * 100),
    description: description || null,
    category: category || null,
    date: date || null,
    imageUrl: image || null,
  };
  const goal = existing
    ? await prisma.goal.update({ where: { id: existing.id }, data })
    : await prisma.goal.create({ data: { ...data, userId: user.id } });

  const contributed = await prisma.goalContribution.aggregate({
    where: { goalId: goal.id },
    _sum: { amountCents: true },
  });
  return NextResponse.json({
    goal: {
      id: goal.id,
      title: goal.title,
      target: centsToReais(goal.targetCents),
      current: centsToReais(contributed._sum.amountCents || 0),
      description: goal.description || "",
      category: goal.category || "",
      date: goal.date || "",
      image: goal.imageUrl || null,
    },
  });
}

// Encerra a meta ativa.
export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  await prisma.goal.updateMany({ where: { userId: user.id, active: true }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
