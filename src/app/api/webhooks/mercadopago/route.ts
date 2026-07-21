import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Webhook do Mercado Pago — VALIDA o pagamento consultando a API oficial com o
// nosso Access Token (nunca confiamos no corpo da notificação) e só então
// credita o valor no ledger da carteira. Idempotente: o mesmo pagamento nunca
// é creditado duas vezes (reference = "mp:<payment_id>").
export async function POST(req: NextRequest) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ ok: true }); // nada configurado, nada a fazer

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
