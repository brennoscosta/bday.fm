import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { createSession, hashPassword, isSlugAllowed, slugify } from "@/lib/auth";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(6).max(200),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  username: z.string().trim().min(3).max(30),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`register:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Muitas tentativas. Tente novamente mais tarde." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Confira os campos e tente novamente." }, { status: 400 });
  }
  const { name, email, password, birthdate, username } = parsed.data;

  const slug = slugify(username);
  if (!isSlugAllowed(slug)) {
    return NextResponse.json({ error: "Esse nome de usuário não está disponível." }, { status: 400 });
  }

  const [emailTaken, slugTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.user.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  if (emailTaken) {
    return NextResponse.json({ error: "Já existe uma conta com esse e-mail. Tente entrar." }, { status: 409 });
  }
  if (slugTaken) {
    return NextResponse.json({ error: `O endereço bday.fm/${slug} já está em uso.` }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      slug,
      birthdate: new Date(`${birthdate}T00:00:00.000Z`),
      passwordHash: await hashPassword(password),
    },
    select: { id: true, slug: true, name: true },
  });

  await createSession(user.id, req.headers.get("user-agent"));
  return NextResponse.json({ slug: user.slug, name: user.name }, { status: 201 });
}
