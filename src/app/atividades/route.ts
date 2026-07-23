import { htmlResponse } from "@/lib/legacy-page";

// Página de atividades (histórico completo do sininho, paginado).
export const dynamic = "force-static";

export function GET() {
  return htmlResponse("atividades.html");
}
