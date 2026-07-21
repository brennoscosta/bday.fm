# bday.fm — Next.js + PostgreSQL (deploy no CapRover)

O visual continua 100% o mesmo: as páginas HTML originais são servidas de `public/` sem nenhuma alteração de aparência. Por baixo, agora existe um backend real:

- **Next.js 15** (App Router) servindo o site e as rotas de API
- **PostgreSQL + Prisma** com migrations versionadas
- **Autenticação real**: cadastro e login gravam no banco, senha com hash bcrypt (custo 12), sessão em cookie httpOnly/secure de 30 dias
- **Segurança**: rate limit em login/cadastro, resposta idêntica para e-mail inexistente ou senha errada (evita enumeração de contas), slugs reservados (`admin`, `api`, ...), validação Zod em todas as entradas, headers de segurança, container roda como usuário não-root
- **Ledger de carteira, presentes e metas** já modelados no banco para a Fase 2 (valores sempre em centavos)

## Rotas de API (Fase 1)

- `POST /api/auth/register` — { name, email, password, birthdate, username }
- `POST /api/auth/login` — { email, password }
- `POST /api/auth/logout`
- `GET /api/auth/me` — usuário da sessão atual
- `GET /api/users/:slug` — perfil público (nunca expõe e-mail/nascimento)
- `GET /api/health` — checa app + banco

## Deploy no CapRover — passo a passo

### 1. Criar o banco (one-click app)

1. No painel: **Apps → One-Click Apps/Databases → PostgreSQL**
2. App name: `bdayfm-db` · Version: `16` · defina usuário `bdayfm`, senha forte, database `bdayfm`
3. NÃO habilite HTTPS/domínio para o banco (ele só precisa da rede interna)

### 2. Criar o app do site

1. **Apps → Create New App**: nome `bdayfm` (sem "Has Persistent Data")
2. Em **App Configs → Environment Variables**, adicione:
   ```
   DATABASE_URL=postgresql://bdayfm:SUA_SENHA@srv-captain--bdayfm-db:5432/bdayfm
   ```
3. Em **HTTP Settings**: Container HTTP Port = `80`, habilite HTTPS (Let's Encrypt) e "Force HTTPS", e conecte o domínio `bday.fm`

### 3. Subir o código

Opção A (mais simples): **Deployment → Upload tar file** — gere com `tar -cf deploy.tar --exclude=node_modules --exclude=.next .` na pasta do projeto.

Opção B: conecte o repositório GitHub em **Deployment → Method 3**.

O build usa o `Dockerfile` (multi-stage, imagem final enxuta). No start, o container aplica as migrations automaticamente (`prisma migrate deploy`) e sobe o servidor.

### 4. Criar a conta admin (uma vez)

No servidor (CapRover → app `bdayfm` → linha de comando do container, ou via `docker exec`):

```
ADMIN_EMAIL=voce@bday.fm ADMIN_PASSWORD='senha-bem-forte' ./node_modules/.bin/prisma db seed
```

(ou rode `npm run db:seed` localmente apontando o `DATABASE_URL` de produção por um túnel)

### 5. Verificar

- `https://bday.fm/api/health` → `{"ok":true}`
- Criar uma conta em `/cadastro.html`, sair, entrar em `/login.html`

## Desenvolvimento local

```
npm install
cp .env.example .env   # ajuste o DATABASE_URL
npx prisma migrate deploy
npm run dev
```

## Observações importantes

- `admin.html` ainda é a interface demo — a proteção real do painel (sessão ADMIN obrigatória no servidor) entra na Fase 2, junto com presentes/carteira/feed ligados ao banco. Até lá, o robots.txt bloqueia indexação e a conta de login demo não existe mais.
- Backup do banco: use o volume do `bdayfm-db` + `pg_dump` agendado (posso montar isso na Fase 2).
