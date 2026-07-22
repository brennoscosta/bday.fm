import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Lista os posts do feed (mais recentes primeiro), com curtidas e comentários.
export async function GET() {
  const me = await getSessionUser();
  const posts = await prisma.feedPost.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      author: { select: { slug: true, name: true, avatarUrl: true } },
      _count: { select: { likes: true, comments: true } },
      likes: me ? { where: { userId: me.id }, select: { id: true } } : false,
    },
  });

  return NextResponse.json({
    posts: posts.map((p) => ({
      id: p.id,
      author: {
        slug: p.author.slug,
        name: p.author.name,
        avatarUrl: p.author.avatarUrl,
      },
      caption: p.caption,
      image: p.image,
      attachType: p.attachType,
      attachData: p.attachData,
      likeCount: p._count.likes,
      commentCount: p._count.comments,
      likedByMe: me ? (p.likes as unknown[]).length > 0 : false,
      createdAt: p.createdAt,
    })),
  });
}

const postSchema = z.object({
  caption: z.string().trim().max(500),
  image: z.string().max(1_500_000).optional().nullable(),
  attachType: z.enum(["bday", "recap"]).optional().nullable(),
  attachData: z.unknown().optional().nullable(),
});

// Cria uma publicação.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para publicar." }, { status: 401 });
  if (!rateLimit(`feedpost:${user.id}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Muitas publicações. Aguarde um pouco." }, { status: 429 });
  }

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira o conteúdo e tente novamente." }, { status: 400 });
  const { caption, image, attachType, attachData } = parsed.data;
  if (!caption && !image) {
    return NextResponse.json({ error: "Escreva algo ou anexe uma imagem." }, { status: 400 });
  }

  const post = await prisma.feedPost.create({
    data: {
      authorId: user.id,
      caption,
      image: image || null,
      attachType: attachType || null,
      attachData: attachData === undefined || attachData === null ? undefined : (attachData as object),
    },
  });
  return NextResponse.json(
    { post: { id: post.id, caption: post.caption, createdAt: post.createdAt } },
    { status: 201 }
  );
}
