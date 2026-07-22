import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, rateLimit } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

const EDITABLE_KEYS = [
  "fee_percent",
  "min_withdraw_reais",
  "instant_fee_percent",
  "points_per_gift",
  "points_mission_bonus",
] as const;

// Admin: parâmetros da plataforma + status das integrações (somente leitura das keys).
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await prisma.setting.findMany();
  const settings: Record<string, unknown> = {};
  for (const r of rows) settings[r.key] = r.value;

  return NextResponse.json({
    settings,
    integrations: {
      mercadoPago: {
        configured: !!process.env.MP_ACCESS_TOKEN,
        webhookSecretConfigured: !!process.env.MP_WEBHOOK_SECRET,
        note: "As chaves são configuradas por variável de ambiente (MP_ACCESS_TOKEN / MP_WEBHOOK_SECRET) no painel do CapRover.",
      },
    },
  });
}

const bodySchema = z.record(z.string(), z.number().min(0).max(1_000_000));

// Admin: atualiza parâmetros numéricos (taxas, mínimos, pontos).
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!rateLimit(`admin-settings:${admin.id}`, 30, 60_000)) {
    return NextResponse.json({ error: "rate" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const updates = Object.entries(parsed.data).filter(([k]) =>
    (EDITABLE_KEYS as readonly string[]).includes(k)
  );
  if (!updates.length) return NextResponse.json({ error: "Nenhum parâmetro válido." }, { status: 400 });

  for (const [key, value] of updates) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
  const rows = await prisma.setting.findMany();
  const settings: Record<string, unknown> = {};
  for (const r of rows) settings[r.key] = r.value;
  return NextResponse.json({ settings });
}
