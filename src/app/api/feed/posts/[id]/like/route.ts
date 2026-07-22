import { NextRequest, NextResponse } from "next/server";
import { prisma, rateLimit } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Alterna a curtida do usuário no post.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para curtir." }, { status: 401 });
  if (!rateLimit(`like:${user.id}`, 120, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Calma aí! Muitas curtidas." }, { status: 429 });
  }

  const { id } = await ctx.params;
  const post = await prisma.feedPost.findUnique({ where: { id }, select: { id: true } });
  if (!post) return NextResponse.json({ error: "Post não encontrado." }, { status: 404 });

  const existing = await prisma.feedLike.findUnique({
    where: { postId_userId: { postId: id, userId: user.id } },
  });
  if (existing) {
    await prisma.feedLike.delete({ where: { id: existing.id } });
  } else {
    await prisma.feedLike.create({ data: { postId: id, userId: user.id } });
  }
  const likeCount = await prisma.feedLike.count({ where: { postId: id } });
  return NextResponse.json({ liked: !existing, likeCount });
}
