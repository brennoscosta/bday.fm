import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { rateLimit } from "@/lib/db";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  // valor em reais (ex.: 25 ou 25.5) — convertido para centavos aqui
  amount: z.number().min(1, "Depósito mínimo de R$ 1,00").max(10000, "Depósito máximo de R$ 10.000,00"),
});

// Cria uma preferência de pagamento no Mercado Pago para depositar saldo na carteira.
// O crédito em si só acontece quando o webhook confirmar o pagamento APROVADO.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Limite por usuário: evita abuso de criação de preferências de pagamento.
  if (!rateLimit(`deposit:${user.id}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
  }

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Pagamentos ainda não configurados. Defina MP_ACCESS_TOKEN no servidor." },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Valor inválido." }, { status: 400 });
  }
  const amount = Math.round(parsed.data.amount * 100) / 100;

  // URL pública do site (para retorno do checkout e webhook)
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const base = `${proto}://${host}`;

  const preference = {
    items: [
      {
        id: "wallet-deposit",
        title: "Depósito na carteira bday.fm",
        quantity: 1,
        unit_price: amount,
        currency_id: "BRL",
      },
    ],
    // sabemos DE QUEM é o depósito quando o webhook chegar
    external_reference: `wallet:${user.id}`,
    notification_url: `${base}/api/webhooks/mercadopago`,
    back_urls: {
      success: `${base}/carteira.html?deposito=ok`,
      pending: `${base}/carteira.html?deposito=pendente`,
      failure: `${base}/carteira.html?deposito=erro`,
    },
    auto_return: "approved",
    statement_descriptor: "BDAYFM",
  };

  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(preference),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Mercado Pago preference error:", res.status, detail.slice(0, 500));
    return NextResponse.json({ error: "Não foi possível iniciar o pagamento. Tente novamente." }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json({ checkoutUrl: data.init_point, preferenceId: data.id });
}
