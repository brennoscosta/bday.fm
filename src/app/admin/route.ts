import { htmlResponse } from "@/lib/legacy-page";
import { requireAdmin } from "@/lib/admin";
import { readPageTemplate } from "@/lib/legacy-page";

// O painel só é SERVIDO se houver sessão com papel ADMIN. Sem isso, responde 404
// (mesmo corpo da página 404) — o conteúdo do admin nunca chega a um anônimo.
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return new Response(readPageTemplate("404.html"), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return htmlResponse("admin.html");
}
