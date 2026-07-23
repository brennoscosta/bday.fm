import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

export const SESSION_COOKIE = "bdayfm_sid";
const SESSION_DAYS = 30;

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function createSession(userId: string, userAgent?: string | null) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt, userAgent: userAgent ?? undefined },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getSessionUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }
  store.delete(SESSION_COOKIE);
}

// Slug: minúsculas, letras/números/hífen, 3-30 chars — mesmo espírito do front
export function slugify(raw: string) {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 30);
}

const RESERVED_SLUGS = new Set([
  "admin", "api", "login", "cadastro", "perfil", "carteira", "feed",
  "explorar", "presentes", "loja", "recap", "sobre", "termos",
  "privacidade", "index", "www", "bday", "suporte", "ajuda", "atividades",
]);

export function isSlugAllowed(slug: string) {
  return slug.length >= 3 && !RESERVED_SLUGS.has(slug);
}
