import { NextRequest, NextResponse } from "next/server";

// Rota temporária de diagnóstico — investiga por que req.nextUrl.origin
// resolvia para o hostname interno do container atrás do proxy do CapRover
// em vez do domínio público. Remover depois de corrigir o redirect de [slug].
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });
  return NextResponse.json({
    nextUrlOrigin: req.nextUrl.origin,
    reqUrl: req.url,
    headers,
  });
}
