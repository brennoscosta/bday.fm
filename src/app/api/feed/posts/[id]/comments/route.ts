import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Lista os comentários de um post.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const comments = await prisma.feedComment.findMany({
    where: { postId: id },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: { user: { select: { slug: true, name: true, avatarUrl: true } } },
  });
  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      author: c.user.name,
      authorSlug: c.user.slug,
      avatar: c.user.avatarUrl,
      text: c.text,
      createdAt: c.createdAt,
    })),
  });
}

const bodySchema = z.object({ text: z.string().trim().min(1).max(300) });

// Comenta em um post.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para comentar." }, { status: 401 });
  if (!rateLimit(`comment:${user.id}`, 60, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Muitos comentários. Aguarde um pouco." }, { status: 429 });
  }

  const { id } = await ctx.params;
  const post = await prisma.feedPost.findUnique({ where: { id }, select: { id: true } });
  if (!post) return NextResponse.json({ error: "Post não encontrado." }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Escreva um comentário válido." }, { status: 400 });

  const comment = await prisma.feedComment.create({
    data: { postId: id, userId: user.id, text: parsed.data.text },
    include: { user: { select: { slug: true, name: true, avatarUrl: true } } },
  });
  const commentCount = await prisma.feedComment.count({ where: { postId: id } });
  return NextResponse.json(
    {
      comment: {
        id: comment.id,
        author: comment.user.name,
        authorSlug: comment.user.slug,
        avatar: comment.user.avatarUrl,
        text: comment.text,
        createdAt: comment.createdAt,
      },
      commentCount,
    },
    { status: 201 }
  );
}
