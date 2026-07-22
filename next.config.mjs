/** @type {import('next').NextConfig} */

// CSP compatível com o site atual: as páginas usam scripts inline, handlers onclick
// e estilos inline (atributos style="") — por isso 'unsafe-inline' é necessário para
// NÃO quebrar nada. Fontes do Google e imagens em data:/blob: são liberadas. Todo o
// resto é restrito à própria origem.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: csp },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  // HSTS: só é honrado sobre HTTPS (ignorado em HTTP); já deixa pronto para quando o
  // HTTPS for habilitado no CapRover.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

// URLs .html continuam funcionando exatamente como hoje (rewrite, sem redirect):
// links compartilhados não quebram.
const pageNames = [
  "explorar", "feed", "presentes", "loja", "carteira", "login",
  "cadastro", "perfil", "recap", "sobre", "termos", "privacidade",
];

const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: "/index.html", destination: "/" },
      { source: "/admin.html", destination: "/admin" },
      ...pageNames.map((p) => ({ source: `/${p}.html`, destination: `/${p}` })),
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
