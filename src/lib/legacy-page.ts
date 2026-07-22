import fs from "fs";
import path from "path";

// Serve o markup ORIGINAL de cada página (byte-idêntico) a partir de page-templates/.
// Mantém o site 100% dentro do Next (App Router route handlers) sem alterar 1 pixel:
// os mesmos bytes de HTML são entregues pelo servidor Next, e os scripts do site
// (users.js, auth.js, script.js e os inline) executam nativamente, na ordem original.
const TEMPLATES_DIR = path.join(process.cwd(), "page-templates");

const cache = new Map<string, string>();

export function readPageTemplate(file: string): string {
  if (cache.has(file)) return cache.get(file)!;
  const full = path.join(TEMPLATES_DIR, file);
  const html = fs.readFileSync(full, "utf8");
  if (process.env.NODE_ENV === "production") cache.set(file, html);
  return html;
}

export function htmlResponse(file: string, init?: { status?: number }): Response {
  const html = readPageTemplate(file);
  return new Response(html, {
    status: init?.status ?? 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // HTML das páginas não é cacheado agressivamente (conteúdo pode mudar por deploy);
      // os assets (css/js/img) em /public continuam com o cache padrão do Next.
      "Cache-Control": "no-cache",
    },
  });
}
