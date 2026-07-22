import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    role: z.enum(["USER", "ADMIN"]),
    verified: z.boolean(),
  })
  .partial();

// Admin: altera cargo e selo de verificação de um usuário.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!rateLimit(`admin-user:${admin.id}`, 60, 60_000)) {
    return NextResponse.json({ error: "rate" }, { status: 429 });
  }

  const { slug } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { slug: slug.toLowerCase() }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: parsed.data,
    select: { slug: true, name: true, role: true, verified: true },
  });
  return NextResponse.json({ user: updated });
}
