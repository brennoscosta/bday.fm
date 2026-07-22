import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { centsToReais, fmtWhen } from "@/lib/social";

export const dynamic = "force-dynamic";

// Lista pública de perfis reais — apenas dados não sensíveis (nunca e-mail,
// nascimento ou role). Usada pelas páginas do site (Explorar, Feed, ranking).
// Enriquecida com agregados reais: total recebido, presentes recentes e
// meta de grupo (BDAY) ativa — o feed deriva os posts desses campos.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limitRaw = parseInt(searchParams.get("limit") || "100", 10);
  const limit = Math.min(Math.max(isNaN(limitRaw) ? 100 : limitRaw, 1), 200);

  const users = await prisma.user.findMany({
    where: { role: "USER" }, // a conta admin não aparece nas listagens públicas
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, slug: true, name: true, bio: true, avatarUrl: true, coverUrl: true,
      frame: true, accessory: true, badge: true, badges: true, socials: true,
      verified: true, birthdate: true, createdAt: true,
    },
  });
  const ids = users.map((u) => u.id);

  const [receivedAgg, giftCounts, goals, recentGifts] = await Promise.all([
    prisma.walletEntry.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, type: "GIFT_RECEIVED" },
      _sum: { amountCents: true },
    }),
    prisma.giftSent.groupBy({
      by: ["receiverId"],
      where: { receiverId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.goal.findMany({
      where: { userId: { in: ids }, active: true },
      include: {
        contributions: {
          orderBy: { createdAt: "desc" },
          take: 12,
          include: { user: { select: { name: true, slug: true } } },
        },
      },
    }),
    prisma.giftSent.findMany({
      where: { receiverId: { in: ids } },
      orderBy: { createdAt: "desc" },
      take: 120,
      include: {
        sender: { select: { name: true, slug: true } },
        giftItem: { select: { name: true, emoji: true } },
      },
    }),
  ]);

  const receivedMap = new Map(receivedAgg.map((r) => [r.userId, r._sum.amountCents || 0]));
  const giftCountMap = new Map(giftCounts.map((r) => [r.receiverId, r._count._all]));
  const goalMap = new Map(
    goals.map((g) => {
      const current = g.contributions.reduce((s, c) => s + c.amountCents, 0);
      return [
        g.userId,
        {
          id: g.id,
          title: g.title,
          target: centsToReais(g.targetCents),
          current: centsToReais(current),
          description: g.description || "",
          category: g.category || "",
          date: g.date || "",
          image: g.imageUrl || null,
          contributors: g.contributions.map((c) => ({
            name: c.user?.name || "Anônimo",
            slug: c.user?.slug || null,
            amount: centsToReais(c.amountCents),
          })),
        },
      ] as const;
    })
  );
  const giftsMap = new Map<string, Array<Record<string, unknown>>>();
  for (const g of recentGifts) {
    const list = giftsMap.get(g.receiverId) || [];
    if (list.length < 5) {
      list.push({
        who: g.sender.name,
        whoSlug: g.sender.slug,
        item: g.giftItem.name,
        emoji: g.giftItem.emoji,
        value: centsToReais(g.valueCents),
        msg: g.message || "",
        when: fmtWhen(g.createdAt),
      });
      giftsMap.set(g.receiverId, list);
    }
  }

  // birthdate vira apenas dia/mês (para "aniversário hoje/este mês") — nunca o ano.
  const today = new Date();
  const result = users.map((u) => {
    let isToday = false;
    let inBirthdayMonth = false;
    let birthdayDayMonth: string | null = null;
    if (u.birthdate) {
      const b = new Date(u.birthdate);
      isToday = b.getUTCDate() === today.getUTCDate() && b.getUTCMonth() === today.getUTCMonth();
      inBirthdayMonth = b.getUTCMonth() === today.getUTCMonth();
      birthdayDayMonth = `${String(b.getUTCDate()).padStart(2, "0")}/${String(b.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    const receivedCents = receivedMap.get(u.id) || 0;
    return {
      slug: u.slug, name: u.name, bio: u.bio, avatarUrl: u.avatarUrl, coverUrl: u.coverUrl,
      frame: u.frame, accessory: u.accessory, badge: u.badge, badges: u.badges,
      socials: u.socials, verified: u.verified,
      isToday, inBirthdayMonth, birthdayDayMonth, createdAt: u.createdAt,
      received: centsToReais(receivedCents),
      receivedCents,
      giftsCount: giftCountMap.get(u.id) || 0,
      groupGoal: goalMap.get(u.id) || null,
      gifts: giftsMap.get(u.id) || [],
    };
  });

  return NextResponse.json({ users: result });
}
