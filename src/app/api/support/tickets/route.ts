import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Lista os chamados do usuário logado.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });

  const tickets = await prisma.supportTicket.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json({
    tickets: tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      messages: t.messages.map((m) => ({
        id: m.id, fromAdmin: m.fromAdmin, text: m.text, createdAt: m.createdAt,
      })),
    })),
  });
}

const bodySchema = z.object({
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(3).max(2000),
  name: z.string().trim().max(80).optional(),
  email: z.string().trim().toLowerCase().email().max(160).optional(),
});

// Abre um chamado de suporte (logado ou não — anônimo precisa de e-mail).
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`support:${user?.id || ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Muitos chamados. Aguarde um pouco." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira os campos e tente novamente." }, { status: 400 });
  const { subject, message, name, email } = parsed.data;
  if (!user && !email) {
    return NextResponse.json({ error: "Informe um e-mail para contato." }, { status: 400 });
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: user?.id || null,
      name: user?.name || name || null,
      email: user?.email || email || null,
      subject,
      messages: { create: { text: message, fromAdmin: false } },
    },
  });
  return NextResponse.json({ ticket: { id: ticket.id, subject: ticket.subject, status: ticket.status } }, { status: 201 });
}
