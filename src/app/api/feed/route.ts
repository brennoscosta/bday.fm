import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
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

