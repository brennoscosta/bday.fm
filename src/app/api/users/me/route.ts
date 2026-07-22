import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { getSessionUser, isSlugAllowed, slugify } from "@/lib/auth";

export const dynamic = "force-dynamic";

const DATA_URL_MAX = 900_000; // ~660KB de imagem em base64

const socialsSchema = z
  .object({
    instagram: z.string().trim().max(120).optional().nullable(),
    tiktok: z.string().trim().max(120).optional().nullable(),
    youtube: z.string().trim().max(120).optional().nullable(),
    linkedin: z.string().trim().max(120).optional().nullable(),
  })
  .partial();

const bodySchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    slug: z.string().trim().min(3).max(30),
    bio: z.string().trim().max(200).nullable(),
    avatarUrl: z.string().max(DATA_URL_MAX).nullable(),
    coverUrl: z.string().max(DATA_URL_MAX).nullable(),
    frame: z.string().trim().max(40).nullable(),
    accessory: z.string().trim().max(40).nullable(),
    badge: z.string().trim().max(60).nullable(),
    socials: socialsSchema.nullable(),
    pixKey: z.string().trim().max(140).nullable(),
    pixKeyType: z.enum(["cpf", "cnpj", "email", "phone", "random"]).nullable(),
  })
  .partial();

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  if (!rateLimit(`profile:${user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Muitas alterações. Aguarde um pouco." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Confira os campos e tente novamente." }, { status: 400 });
  }
  const data = parsed.data;
  const update: Record<string, unknown> = {};

  if (data.name !== undefined) update.name = data.name;
  if (data.bio !== undefined) update.bio = data.bio;
  if (data.avatarUrl !== undefined) update.avatarUrl = data.avatarUrl;
  if (data.coverUrl !== undefined) update.coverUrl = data.coverUrl;
  if (data.badge !== undefined) update.badge = data.badge;
  if (data.socials !== undefined) update.socials = data.socials ?? undefined;
  if (data.pixKey !== undefined) update.pixKey = data.pixKey;
  if (data.pixKeyType !== undefined) update.pixKeyType = data.pixKeyType;

  if (data.slug !== undefined) {
    const slug = slugify(data.slug);
    if (!isSlugAllowed(slug)) {
      return NextResponse.json({ error: "Esse nome de usuário não está disponível." }, { status: 400 });
    }
    if (slug !== user.slug) {
      const taken = await prisma.user.findUnique({ where: { slug }, select: { id: true } });
      if (taken) {
        return NextResponse.json({ error: `O endereço bday.fm/${slug} já está em uso.` }, { status: 409 });
      }
      update.slug = slug;
    }
  }

  // Molduras e decorações só podem ser equipadas se o usuário as possui
  // (compradas na loja) — ou se já estavam equipadas antes.
  for (const kind of ["frame", "accessory"] as const) {
    const value = data[kind];
    if (value !== undefined && value !== null && value !== user[kind]) {
      const owned = await prisma.userItem.findUnique({
        where: { userId_kind_itemId: { userId: user.id, kind, itemId: value } },
      });
      if (!owned) {
        return NextResponse.json(
          { error: kind === "frame" ? "Você ainda não possui essa moldura." : "Você ainda não possui essa decoração." },
          { status: 400 }
        );
      }
      update[kind] = value;
    } else if (value === null) {
      update[kind] = null;
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: update,
    select: {
      slug: true, name: true, bio: true, avatarUrl: true, coverUrl: true,
      frame: true, accessory: true, badge: true, badges: true, socials: true,
      verified: true, pixKey: true, pixKeyType: true,
    },
  });
  return NextResponse.json({ user: updated });
}
