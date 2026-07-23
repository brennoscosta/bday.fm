import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { acceptedFriends, notify } from "@/lib/social";

export const dynamic = "force-dynamic";

const slugSchema = z.object({ slug: z.string().trim().min(1).max(40) });
const patchSchema = z.object({
  slug: z.string().trim().min(1).max(40),
  action: z.enum(["accept", "reject"]),
});

// Lista amigos aceitos + pedidos pendentes (recebidos e enviados).
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });

  const [friends, incoming, outgoing] = await Promise.all([
    acceptedFriends(user.id),
    prisma.friendship.findMany({
      where: { addresseeId: user.id, status: "PENDING" },
      include: { requester: { select: { slug: true, name: true, avatarUrl: true } } },
    }),
    prisma.friendship.findMany({
      where: { requesterId: user.id, status: "PENDING" },
      include: { addressee: { select: { slug: true, name: true, avatarUrl: true } } },
    }),
  ]);

  return NextResponse.json({
    friends: friends.map((f) => ({ slug: f.slug, name: f.name, avatarUrl: f.avatarUrl })),
    incoming: incoming.map((f) => ({
      slug: f.requester.slug, name: f.requester.name, avatarUrl: f.requester.avatarUrl,
    })),
    outgoing: outgoing.map((f) => ({
      slug: f.addressee.slug, name: f.addressee.name, avatarUrl: f.addressee.avatarUrl,
    })),
  });
}

// Envia um pedido de amizade (aceita automaticamente se já havia pedido inverso).
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  if (!rateLimit(`friends:${user.id}`, 60, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Muitos pedidos. Aguarde um pouco." }, { status: 429 });
  }

  const parsed = slugSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  const target = await prisma.user.findUnique({
    where: { slug: parsed.data.slug.toLowerCase() },
    select: { id: true, slug: true, name: true },
  });
  if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  if (target.id === user.id) return NextResponse.json({ error: "Você não pode adicionar a si mesmo." }, { status: 400 });

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: user.id, addresseeId: target.id },
        { requesterId: target.id, addresseeId: user.id },
      ],
    },
  });

  if (existing) {
    if (existing.status === "ACCEPTED") {
      return NextResponse.json({ status: "ACCEPTED", message: "Vocês já são amigos." });
    }
    if (existing.requesterId === user.id) {
      return NextResponse.json({ status: "PENDING", message: "Pedido já enviado. Aguardando confirmação." });
    }
    // pedido inverso pendente → aceita
    await prisma.friendship.update({ where: { id: existing.id }, data: { status: "ACCEPTED" } });
    await notify(prisma, target.id, "FRIEND_ACCEPT", user.id);
    await notify(prisma, user.id, "FRIEND_ACCEPTED_BY_YOU", target.id);
    return NextResponse.json({ status: "ACCEPTED", message: `Agora você e ${target.name} são amigos!` });
  }

  await prisma.friendship.create({
    data: { requesterId: user.id, addresseeId: target.id },
  });
  await notify(prisma, target.id, "FRIEND_REQUEST", user.id);
  await notify(prisma, user.id, "FRIEND_REQUEST_SENT", target.id);
  return NextResponse.json({ status: "PENDING", message: "Pedido de amizade enviado!" }, { status: 201 });
}

// Aceita ou recusa um pedido recebido.
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  const requester = await prisma.user.findUnique({
    where: { slug: parsed.data.slug.toLowerCase() },
    select: { id: true },
  });
  if (!requester) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  const friendship = await prisma.friendship.findFirst({
    where: { requesterId: requester.id, addresseeId: user.id, status: "PENDING" },
  });
  if (!friendship) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });

  if (parsed.data.action === "accept") {
    await prisma.friendship.update({ where: { id: friendship.id }, data: { status: "ACCEPTED" } });
    await notify(prisma, requester.id, "FRIEND_ACCEPT", user.id);
    await notify(prisma, user.id, "FRIEND_ACCEPTED_BY_YOU", requester.id);
    return NextResponse.json({ status: "ACCEPTED" });
  }
  await prisma.friendship.delete({ where: { id: friendship.id } });
  return NextResponse.json({ status: "REJECTED" });
}

// Desfaz amizade (ou cancela pedido) em qualquer direção.
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });

  const parsed = slugSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  const target = await prisma.user.findUnique({
    where: { slug: parsed.data.slug.toLowerCase() },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  await prisma.friendship.deleteMany({
    where: {
      OR: [
        { requesterId: user.id, addresseeId: target.id },
        { requesterId: target.id, addresseeId: user.id },
      ],
    },
  });
  return NextResponse.json({ ok: true });
}
