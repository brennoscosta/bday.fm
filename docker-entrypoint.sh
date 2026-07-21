#!/bin/sh
set -e
echo "Aplicando migrations do banco..."
./node_modules/.bin/prisma migrate deploy
echo "Iniciando bday.fm..."
exec node server.js
