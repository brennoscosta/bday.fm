import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma, rateLimit } from "@/lib/db";

export const dynamic = "force-dynamic";

// Valida a ASSINATURA da notificação conforme a documentação oficial do MP:
// header x-signature ("ts=...,v1=...") + x-request-id. O manifest assinado é
// `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` com HMAC-SHA256 usando a
// chave secreta do webhook (MP_WEBHOOK_SECRET). Só é exigida quando a chave está
// configurada — assim ambientes sem a chave ainda funcionam (com aviso).
function assinaturaValida(req: NextRequest, dataId: string | null): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("MP webhook: MP_WEBHOOK_SECRET não definido — assinatura não verificada.");
    return true;
  }
  const sig = req.headers.get("x-signature") || "";
  const requestId = req.headers.get("x-request-id") || "";
  const parts = Object.fromEntries(
    sig.split(",").map((kv) => kv.split("=").map((s) => s.trim())).filter((a) => a.length === 2),
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1 || !dataId) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(v1, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Webhook do Mercado Pago — VALIDA a assinatura, depois confirma o pagamento
// consultando a API oficial com o nosso Access Token (nunca confiamos no corpo da
// notificação) e só então credita o valor no ledger da carteira. Idempotente: o
// mesmo pagamento nunca é creditado duas vezes (reference = "mp:<payment_id>").
export async function POST(req: NextRequest) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ ok: true }); // nada configurado, nada a fazer

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`mpwebhook:${ip}`, 120, 60 * 1000)) {
    return NextResponse.json({ ok: true }, { status: 429 });
  }

  // O MP notifica de formas diferentes: query (?topic=payment&id=...) ou corpo
  // JSON ({ type: "payment", data: { id } }). Aceitamos as duas.
  const url = new URL(req.url);
  const body = await req.json().catch(() => null as any);
  const topic = url.searchParams.get("topic") || url.searchParams.get("type") || body?.type || body?.topic;
  const paymentId =
    url.searchParams.get("data.id") || url.searchParams.get("id") || body?.data?.id || body?.resource?.split?.("/")?.pop?.();

  if (!paymentId || (topic && !String(topic).includes("payment"))) {
    return NextResponse.json({ ok: true }); // notificação que não nos interessa
  }

  if (!assinaturaValida(req, url.searchParams.get("data.id") || url.searchParams.get("id") || (body?.data?.id ? String(body.data.id) : null))) {
    console.error("MP webhook: assinatura inválida — notificação recusada.");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // Consulta oficial — fonte da verdade sobre o status do pagamento
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error("MP webhook: falha ao consultar pagamento", paymentId, res.status);
    return NextResponse.json({ ok: true }); // 200 para o MP não re-tentar infinito
  }
  const payment = await res.json();

  if (payment.status !== "approved") return NextResponse.json({ ok: true });

  const extRef: string = payment.external_reference || "";
  if (!extRef.startsWith("wallet:")) return NextResponse.json({ ok: true });
  const userId = extRef.slice("wallet:".length);

  const amountCents = Math.round(Number(payment.transaction_amount) * 100);
  if (!userId || !amountCents || amountCents <= 0) return NextResponse.json({ ok: true });

  const reference = `mp:${payment.id}`;
  const already = await prisma.walletEntry.findFirst({ where: { reference } });
  if (already) return NextResponse.json({ ok: true }); // idempotência

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ ok: true });

  await prisma.walletEntry.create({
    data: { userId, type: "DEPOSIT_MP", amountCents, reference },
  });
  console.log(`MP webhook: crédito de ${amountCents} centavos para ${user.slug} (${reference})`);

  return NextResponse.json({ ok: true });
}

// O MP também testa o endpoint com GET
export async function GET() {
  return NextResponse.json({ ok: true });
}
