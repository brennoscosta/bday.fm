// Cria a conta administrativa inicial a partir de variáveis de ambiente.
// Uso: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:seed
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 10) {
    throw new Error("Defina ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 10 caracteres).");
  }
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { role: "ADMIN" },
    create: {
      email: email.toLowerCase(),
      name: "Admin bday.fm",
      slug: "bdayfm-admin",
      passwordHash: await bcrypt.hash(password, 12),
      role: "ADMIN",
    },
  });
  console.log(`Admin pronto: ${user.email}`);
}

main().finally(() => prisma.$disconnect());
