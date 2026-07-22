import { htmlResponse } from "@/lib/legacy-page";

// Página servida pelo App Router com o markup original (byte-idêntico).
export const dynamic = "force-static";

export function GET() {
  return htmlResponse("privacidade.html");
}
