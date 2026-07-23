import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Lista as atividades/notificações do usuário logado, paginadas (25 por página).
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const pageRaw = parseInt(searchParams.get("page") || "1", 10);
  const perRaw = parseInt(searchParams.get("perPage") || "25", 10);
  const page = Math.max(isNaN(pageRaw) ? 1 : pageRaw, 1);
  const perPage = Math.min(Math.max(isNaN(perRaw) ? 25 : perRaw, 1), 50);

  const [total, unreadCount, notifications] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id } }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { actor: { select: { slug: true, name: true, avatarUrl: true } } },
    }),
  ]);

  return NextResponse.json({
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      data: n.data,
      read: n.read,
      createdAt: n.createdAt,
      actor: n.actor ? { slug: n.actor.slug, name: n.actor.name, avatarUrl: n.actor.avatarUrl } : null,
    })),
    total,
    unreadCount,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  });
}
