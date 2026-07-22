import type { Metadata } from "next";
import { readPageTemplate } from "@/lib/legacy-page";

export const metadata: Metadata = {
  title: "Página não encontrada — bday.fm",
  description: "Esta página não existe ou foi movida.",
  robots: { index: false, follow: false },
};

// 404 do App Router com o mesmo conteúdo visual da antiga 404.html.
// Extrai o corpo do template original para manter markup idêntico.
function notFoundBody(): string {
  const html = readPageTemplate("404.html");
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1] : "";
}

export default function NotFound() {
  return <div dangerouslySetInnerHTML={{ __html: notFoundBody() }} />;
}
