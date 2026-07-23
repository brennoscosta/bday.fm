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
    const url = new URL(req.url);
    url.pathname = `/${slug}`;
    return NextResponse.redirect(url, 301);
  }

  return htmlResponse("perfil.html");
}
