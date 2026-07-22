import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

// Admin: lista os chamados de suporte com as mensagens.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const tickets = await prisma.supportTicket.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      user: { select: { slug: true, name: true, email: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  return NextResponse.json({
    tickets: tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      name: t.user?.name || t.name,
      email: t.user?.email || t.email,
      slug: t.user?.slug || null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      messages: t.messages.map((m) => ({
        id: m.id, fromAdmin: m.fromAdmin, text: m.text, createdAt: m.createdAt,
      })),
    })),
  });
}
