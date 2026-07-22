import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function loadTicketFor(id: string) {
  const user = await getSessionUser();
  if (!user) return { user: null, ticket: null, isAdmin: false };
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  const isAdmin = user.role === "ADMIN";
  if (!ticket || (!isAdmin && ticket.userId !== user.id)) return { user, ticket: null, isAdmin };
  return { user, ticket, isAdmin };
}

// Lista as mensagens de um chamado (dono ou admin).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { user, ticket } = await loadTicketFor(id);
  if (!user) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  if (!ticket) return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });

  const messages = await prisma.supportMessage.findMany({
    where: { ticketId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    ticket: { id: ticket.id, subject: ticket.subject, status: ticket.status },
    messages: messages.map((m) => ({ id: m.id, fromAdmin: m.fromAdmin, text: m.text, createdAt: m.createdAt })),
  });
}

const bodySchema = z.object({ text: z.string().trim().min(1).max(2000) });

// Responde em um chamado (dono ou admin).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { user, ticket, isAdmin } = await loadTicketFor(id);
  if (!user) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  if (!ticket) return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });
  if (!rateLimit(`support-msg:${user.id}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Muitas mensagens. Aguarde um pouco." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Escreva uma mensagem válida." }, { status: 400 });

  const message = await prisma.supportMessage.create({
    data: { ticketId: id, text: parsed.data.text, fromAdmin: isAdmin },
  });
  await prisma.supportTicket.update({
    where: { id },
    data: { status: isAdmin ? "PENDING" : "OPEN" },
  });
  return NextResponse.json(
    { message: { id: message.id, fromAdmin: message.fromAdmin, text: message.text, createdAt: message.createdAt } },
    { status: 201 }
  );
}
