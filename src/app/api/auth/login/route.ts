import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(1).max(200),
});

const GENERIC_ERROR = "E-mail ou senha incorretos.";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`login:${ip}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  // Mesmo tempo de resposta com ou sem usuário (evita enumeração de e-mails)
  const hash = user?.passwordHash ?? "$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZBv1kO0mS2b8s1G0Y6mVvXvJ1yWm2u";
  const ok = await verifyPassword(password, hash);

  if (!user || !ok) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  await createSession(user.id, req.headers.get("user-agent"));
  return NextResponse.json({ slug: user.slug, name: user.name, role: user.role });
}
