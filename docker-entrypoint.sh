#!/bin/sh
set -e
echo "Aplicando migrations do banco..."
node ./node_modules/prisma/build/index.js migrate deploy

# Cria/atualiza a conta ADMIN quando ADMIN_EMAIL e ADMIN_PASSWORD estão definidos
# nas variáveis do app (CapRover). O seed é idempotente (upsert) — rodar em todo
# boot é seguro e garante que a conta exista e tenha papel ADMIN.
if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "Garantindo conta administrativa ($ADMIN_EMAIL)..."
  ./node_modules/.bin/tsx prisma/seed.ts || echo "Aviso: seed do admin falhou (o site sobe mesmo assim)"
fi

echo "Iniciando bday.fm..."
exec node server.js
