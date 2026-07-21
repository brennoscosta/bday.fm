// Layout mínimo: o site visual vive em /public como HTML estático.
// Este app Next existe para as rotas de API e páginas futuras (perfil SSR).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
