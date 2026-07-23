import { NextRequest, NextResponse } from "next/server";
import { htmlResponse } from "@/lib/legacy-page";

// Página servida pelo App Router com o markup original (byte-idêntico).
// /perfil?user=<slug> redireciona 301 para a URL pública amigável /<slug>
// (links antigos continuam funcionando); sem ?user=, abre o próprio perfil.
export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9][a-z0-9.-]{1,29}$/;

export function GET(req: NextRequest) {
  const user = req.nextUrl.searchParams.get("user");
  if (user && SLUG_RE.test(user.toLowerCase())) {
    return NextResponse.redirect(new URL(`/${user.toLowerCase()}`, publicOrigin(req)), 301);
  }
  return htmlResponse("perfil.html");
}

// req.nextUrl.origin resolve para o hostname interno do container atrás do
// proxy do CapRover (não para o domínio público) — usa os cabeçalhos
// X-Forwarded-Host/Proto (ou Host), que chegam corretos. Mesmo helper usado
// em src/app/[slug]/route.ts.
function publicOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return host ? `${proto}://${host}` : req.nextUrl.origin;
}
