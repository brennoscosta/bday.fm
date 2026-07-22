// Validação das variáveis de ambiente no boot. Falha cedo, com mensagem clara,
// quando algo obrigatório está ausente; apenas avisa sobre as opcionais.
export function validateEnv() {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL não definida (string de conexão do Postgres).");
  }

  // Opcionais — o site sobe sem elas, mas com funcionalidade reduzida.
  if (!process.env.MP_ACCESS_TOKEN) {
    warnings.push("MP_ACCESS_TOKEN ausente — depósitos via Mercado Pago ficam desativados.");
  }
  if (process.env.MP_ACCESS_TOKEN && !process.env.MP_WEBHOOK_SECRET) {
    warnings.push("MP_WEBHOOK_SECRET ausente — a assinatura do webhook do Mercado Pago não será verificada.");
  }
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    warnings.push("ADMIN_EMAIL/ADMIN_PASSWORD ausentes — a conta administrativa não será criada/atualizada no boot.");
  }

  warnings.forEach((w) => console.warn("[env] aviso:", w));

  if (errors.length) {
    errors.forEach((e) => console.error("[env] ERRO:", e));
    throw new Error("Variáveis de ambiente obrigatórias ausentes. Veja os erros acima.");
  }
}
