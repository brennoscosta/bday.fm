import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Lista pública de perfis reais — apenas dados não sensíveis (nunca e-mail,
// nascimento ou role). Usada pelas páginas do site (Explorar, Feed, ranking)
// no lugar da antiga lista fictícia de demonstração.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limitRaw = parseInt(searchParams.get("limit") || "100", 10);
  const limit = Math.min(Math.max(isNaN(limitRaw) ? 100 : limitRaw, 1), 200);

  const users = await prisma.user.findMany({
    where: { role: "USER" }, // a conta admin não aparece nas listagens públicas
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      slug: true, name: true, bio: true, avatarUrl: true,
      frame: true, accessory: true, badges: true, socials: true,
      birthdate: true, createdAt: true,
    },
  });

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
    return {
      slug: u.slug, name: u.name, bio: u.bio, avatarUrl: u.avatarUrl,
      frame: u.frame, accessory: u.accessory, badges: u.badges, socials: u.socials,
      isToday, inBirthdayMonth, birthdayDayMonth, createdAt: u.createdAt,
    };
  });

  return NextResponse.json({ users: result });
}
