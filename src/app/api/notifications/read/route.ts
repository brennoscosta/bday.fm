import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ ids: z.array(z.string().max(40)).max(100).optional() }).optional();

// Marca notificações como lidas (todas, ou apenas as informadas em ids).
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => undefined));
  const ids = parsed.success ? parsed.data?.ids : undefined;

  await prisma.notification.updateMany({
    where: { userId: user.id, read: false, ...(ids && ids.length ? { id: { in: ids } } : {}) },
    data: { read: true },
  });
  const unreadCount = await prisma.notification.count({ where: { userId: user.id, read: false } });
  return NextResponse.json({ ok: true, unreadCount });
}
