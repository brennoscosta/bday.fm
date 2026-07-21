#!/bin/sh
set -e
echo "Aplicando migrations do banco..."
node ./node_modules/prisma/build/index.js migrate deploy
echo "Iniciando bday.fm..."
exec node server.js
