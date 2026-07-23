// Helpers compartilhados dos fluxos sociais/financeiros (presentes, feed,
// loja, saques, amigos, recap). Dinheiro sempre em centavos no banco;
// as respostas expõem também o valor em reais quando o front precisa.
import { prisma } from "./db";

// ---------- Parâmetros da plataforma (tabela Setting, com defaults) ----------

const SETTING_DEFAULTS: Record<string, number> = {
  fee_percent: 20,          // taxa de serviço sobre presentes/contribuições
  min_withdraw_reais: 10,   // saque mínimo
  instant_fee_percent: 6,   // taxa do saque instantâneo
  points_per_gift: 40,      // pontos por presente enviado
  points_mission_bonus: 80, // bônus da missão semanal (3 envios)
};

export async function getSettingNumber(key: string): Promise<number> {
  try {
    const row = await prisma.setting.findUnique({ where: { key } });
    if (row && typeof row.value === "number") return row.value;
    if (row && typeof row.value === "string" && !isNaN(Number(row.value))) return Number(row.value);
  } catch {
    /* tabela pode não existir em ambientes antigos */
  }
  return SETTING_DEFAULTS[key] ?? 0;
}

// ---------- Carteira ----------

export async function balanceCents(userId: string): Promise<number> {
  const agg = await prisma.walletEntry.aggregate({
    where: { userId },
    _sum: { amountCents: true },
  });
  return agg._sum.amountCents || 0;
}

// ---------- Pontos de recompensa ----------

export async function pointsBalance(userId: string): Promise<number> {
  const agg = await prisma.pointEntry.aggregate({
    where: { userId },
    _sum: { delta: true },
  });
  return agg._sum.delta || 0;
}

// ---------- Formatação ----------

export function fmtWhen(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

export function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

// ---------- Notificações / atividades ----------

// Tipos: FRIEND_REQUEST_SENT | FRIEND_REQUEST | FRIEND_ACCEPT | FRIEND_ACCEPTED_BY_YOU
//        GIFT | TORPEDO | GOAL_CONTRIBUTION | POST_LIKE | POST_COMMENT
export async function notify(
  client: Pick<typeof prisma, "notification">,
  userId: string,
  type: string,
  actorId?: string | null,
  data?: Record<string, unknown>
) {
  try {
    await client.notification.create({
      data: {
        userId,
        type,
        actorId: actorId || null,
        data: data ? (data as object) : undefined,
      },
    });
  } catch {
    // Notificação nunca derruba o fluxo principal.
  }
}

// ---------- Amigos ----------

// Lista de amizades ACEITAS de um usuário (em qualquer direção).
export async function acceptedFriends(userId: string) {
  const rows = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    include: {
      requester: { select: { id: true, slug: true, name: true, avatarUrl: true } },
      addressee: { select: { id: true, slug: true, name: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((f) => (f.requesterId === userId ? f.addressee : f.requester));
}

// ---------- Perfil público enriquecido ----------

// Dados agregados que o front consome via users.js (shape de bdayRecordFromApi).
export async function enrichUser(user: {
  id: string;
  slug: string;
  name: string;
}) {
  const year = new Date().getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));

  const [receivedAgg, gifts, friends, goal, points, yearGifts, items] = await Promise.all([
    prisma.walletEntry.aggregate({
      where: { userId: user.id, type: "GIFT_RECEIVED" },
      _sum: { amountCents: true },
    }),
    prisma.giftSent.findMany({
      where: { receiverId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        sender: { select: { slug: true, name: true } },
        giftItem: { select: { name: true, emoji: true } },
      },
    }),
    acceptedFriends(user.id),
    prisma.goal.findFirst({
      where: { userId: user.id, active: true },
      include: {
        contributions: {
          orderBy: { createdAt: "desc" },
          take: 30,
          include: { user: { select: { slug: true, name: true } } },
        },
      },
    }),
    pointsBalance(user.id),
    prisma.giftSent.findMany({
      where: { receiverId: user.id, createdAt: { gte: startOfYear } },
      include: { sender: { select: { slug: true, name: true } } },
    }),
    prisma.userItem.findMany({
      where: { userId: user.id },
      select: { kind: true, itemId: true },
    }),
  ]);

  const receivedCents = receivedAgg._sum.amountCents || 0;

  // Recap do ano: total, quantidade, amigos distintos, maior presenteador,
  // mensagem do maior presente com mensagem.
  const bySender = new Map<string, { name: string; total: number }>();
  let topMessage: string | null = null;
  let topMsgValue = -1;
  let totalYearCents = 0;
  for (const g of yearGifts) {
    totalYearCents += g.valueCents;
    const cur = bySender.get(g.sender.slug) || { name: g.sender.name, total: 0 };
    cur.total += g.valueCents;
    bySender.set(g.sender.slug, cur);
    if (g.message && g.valueCents > topMsgValue) {
      topMsgValue = g.valueCents;
      topMessage = g.message;
    }
  }
  let topGifter: string | null = null;
  let topGifterAmount = 0;
  for (const [, v] of bySender) {
    if (v.total > topGifterAmount) {
      topGifterAmount = v.total;
      topGifter = v.name;
    }
  }

  const goalContribCents = goal
    ? (
        await prisma.goalContribution.aggregate({
          where: { goalId: goal.id },
          _sum: { amountCents: true },
        })
      )._sum.amountCents || 0
    : 0;

  return {
    received: centsToReais(receivedCents),
    receivedCents,
    giftsCount: gifts.length,
    points,
    wonFrames: items.filter((i) => i.kind === "frame").map((i) => i.itemId),
    wonAccessories: items.filter((i) => i.kind === "accessory").map((i) => i.itemId),
    gifts: gifts.map((g) => ({
      who: g.sender.name,
      whoSlug: g.sender.slug,
      item: g.giftItem.name,
      emoji: g.giftItem.emoji,
      value: centsToReais(g.valueCents),
      msg: g.message || "",
      when: fmtWhen(g.createdAt),
    })),
    friends: friends.length,
    friendsList: friends.map((f) => ({
      slug: f.slug,
      name: f.name,
      avatarUrl: f.avatarUrl,
    })),
    groupGoal: goal
      ? {
          id: goal.id,
          title: goal.title,
          target: centsToReais(goal.targetCents),
          current: centsToReais(goalContribCents),
          description: goal.description || "",
          category: goal.category || "",
          date: goal.date || "",
          image: goal.imageUrl || null,
          contributors: goal.contributions.map((c) => ({
            name: c.user?.name || "Anônimo",
            slug: c.user?.slug || null,
            amount: centsToReais(c.amountCents),
          })),
        }
      : null,
    recap: {
      year,
      totalReceived: centsToReais(totalYearCents),
      giftsReceived: yearGifts.length,
      friendsParticipated: bySender.size,
      topGifter,
      topGifterAmount: centsToReais(topGifterAmount),
      topMessage,
      rankPercent: null as number | null, // preenchido pelo chamador quando fizer sentido
    },
  };
}
