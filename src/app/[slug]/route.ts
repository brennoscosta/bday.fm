import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { htmlResponse } from "@/lib/legacy-page";

// URL pública amigável do perfil: bday.fm/<usuario>.
// Serve a página de perfil (markup original); o script da página resolve o
// usuário a partir do caminho (users.js → getUserFromQuery). Slug inexistente
// ou inválido cai no 404 original do site.
export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9][a-z0-9.-]{1,29}$/;

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await ctx.params;
  const decodedRaw = decodeURIComponent(raw);
  const slug = decodedRaw.toLowerCase();
  if (!SLUG_RE.test(slug)) return htmlResponse("404.html", { status: 404 });

  const user = await prisma.user.findUnique({ where: { slug }, select: { id: true } });
  if (!user) return htmlResponse("404.html", { status: 404 });

  // Redireciona para a forma canônica em minúsculas (ex.: /LIONENZO → /lionenzo).
  // Sem isso, o link com maiúsculas ainda renderizava a página, mas o script
  // client-side (users.js) não reconhecia o slug e caía no perfil de quem
  // estivesse logado no navegador — corrige na origem, além do fix em users.js.
  if (decodedRaw !== slug) {
    return NextResponse.redirect(new URL(`/${slug}`, publicOrigin(req)), 301);
  }

  return htmlResponse("perfil.html");
}

// Nem req.nextUrl.origin nem req.url são confiáveis atrás do proxy do
// CapRover: em produção ambos resolvem para o hostname interno do container
// (ex.: https://23dd4819c338:80), não para o domínio público — um redirect
// absoluto construído com eles quebra (o navegador tenta abrir o hostname
// interno, que não resolve). Os cabeçalhos X-Forwarded-Host/Proto e Host,
// esses sim, chegam corretos (confirmado via /api/debug/headers em produção).
function publicOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return host ? `${proto}://${host}` : req.nextUrl.origin;
}
