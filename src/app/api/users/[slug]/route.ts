import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Perfil público — apenas dados não sensíveis (nunca e-mail ou nascimento completo)
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const user = await prisma.user.findUnique({
    where: { slug: slug.toLowerCase() },
    select: {
      slug: true, name: true, bio: true, avatarUrl: true,
      frame: true, accessory: true, badges: true, socials: true, createdAt: true,
    },
  });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ user });
}
