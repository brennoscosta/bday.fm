import { getSessionUser } from "./auth";

// Retorna o usuário da sessão somente se for ADMIN; caso contrário, null.
export async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}
