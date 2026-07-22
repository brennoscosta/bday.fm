import type { Metadata } from "next";

// As páginas do site são servidas byte-a-byte por route handlers (App Router) a
// partir de page-templates/. Este layout cobre apenas as telas renderizadas pelo
// React (ex.: not-found), reproduzindo o mesmo <head> das páginas estáticas para
// manter a identidade visual idêntica.
export const metadata: Metadata = {
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/tailwind-prod.css" />
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body className="bg-white">{children}</body>
    </html>
  );
}
