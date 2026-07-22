import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enrichUser } from "@/lib/social";

export const dynamic = "force-dynamic";

// Perfil público enriquecido — apenas dados não sensíveis (nunca e-mail ou
// nascimento completo). Inclui agregados reais: presentes recebidos, amigos,
// meta de grupo (BDAY) e recap anual.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const user = await prisma.user.findUnique({
    where: { slug: slug.toLowerCase() },
    select: {
      id: true, slug: true, name: true, bio: true, avatarUrl: true, coverUrl: true,
      frame: true, accessory: true, badge: true, badges: true, socials: true,
      verified: true, birthdate: true, createdAt: true,
    },
  });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const enriched = await enrichUser(user);

  // rankPercent: posição do usuário entre quem já recebeu presentes.
  if (enriched.receivedCents > 0) {
    const [better, total] = await Promise.all([
      prisma.walletEntry
        .groupBy({ by: ["userId"], where: { type: "GIFT_RECEIVED" }, _sum: { amountCents: true } })
        .then((rows) => rows.filter((r) => (r._sum.amountCents || 0) > enriched.receivedCents).length),
      prisma.walletEntry.groupBy({ by: ["userId"], where: { type: "GIFT_RECEIVED" } }).then((r) => r.length),
    ]);
    if (total > 0) enriched.recap.rankPercent = Math.max(1, Math.ceil(((better + 1) / total) * 100));
  }

  const today = new Date();
  let isToday = false;
  let inBirthdayMonth = false;
  let birthdayDayMonth: string | null = null;
  if (user.birthdate) {
    const b = new Date(user.birthdate);
    isToday = b.getUTCDate() === today.getUTCDate() && b.getUTCMonth() === today.getUTCMonth();
    inBirthdayMonth = b.getUTCMonth() === today.getUTCMonth();
    birthdayDayMonth = `${String(b.getUTCDate()).padStart(2, "0")}/${String(b.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  return NextResponse.json({
    user: {
      slug: user.slug, name: user.name, bio: user.bio, avatarUrl: user.avatarUrl,
      coverUrl: user.coverUrl, frame: user.frame, accessory: user.accessory,
      badge: user.badge, badges: user.badges, socials: user.socials,
      verified: user.verified, createdAt: user.createdAt,
      isToday, inBirthdayMonth, birthdayDayMonth,
      ...enriched,
    },
  });
}
