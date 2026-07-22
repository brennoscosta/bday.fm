-- bday.fm — Fase 3: social (amigos, feed), comércio (loja, presentes),
-- saques Pix, gamificação (pontos), suporte e parâmetros da plataforma.

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED');
CREATE TYPE "WithdrawalStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'DONE', 'FAILED', 'REJECTED');
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'PENDING', 'CLOSED');

-- AlterTable: User
ALTER TABLE "User" ADD COLUMN "coverUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "badge" TEXT;
ALTER TABLE "User" ADD COLUMN "pixKey" TEXT;
ALTER TABLE "User" ADD COLUMN "pixKeyType" TEXT;

-- AlterTable: GiftItem
ALTER TABLE "GiftItem" ADD COLUMN "description" TEXT;
ALTER TABLE "GiftItem" ADD COLUMN "category" TEXT;
ALTER TABLE "GiftItem" ADD COLUMN "rarity" TEXT;
ALTER TABLE "GiftItem" ADD COLUMN "physical" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GiftItem" ADD COLUMN "partner" TEXT;
ALTER TABLE "GiftItem" ADD COLUMN "baseSentCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GiftItem" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Goal
ALTER TABLE "Goal" ADD COLUMN "description" TEXT;
ALTER TABLE "Goal" ADD COLUMN "category" TEXT;
ALTER TABLE "Goal" ADD COLUMN "date" TEXT;
ALTER TABLE "Goal" ADD COLUMN "imageUrl" TEXT;

-- CreateTable: Friendship
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");
CREATE INDEX "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: FeedPost
CREATE TABLE "FeedPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "image" TEXT,
    "attachType" TEXT,
    "attachData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FeedPost_createdAt_idx" ON "FeedPost"("createdAt");
ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: FeedLike
CREATE TABLE "FeedLike" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedLike_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeedLike_postId_userId_key" ON "FeedLike"("postId", "userId");
ALTER TABLE "FeedLike" ADD CONSTRAINT "FeedLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedLike" ADD CONSTRAINT "FeedLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: FeedComment
CREATE TABLE "FeedComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FeedComment_postId_createdAt_idx" ON "FeedComment"("postId", "createdAt");
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Withdrawal
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "netCents" INTEGER NOT NULL,
    "speed" TEXT NOT NULL DEFAULT 'standard',
    "pixKey" TEXT NOT NULL,
    "pixKeyType" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Withdrawal_userId_createdAt_idx" ON "Withdrawal"("userId", "createdAt");
CREATE INDEX "Withdrawal_status_idx" ON "Withdrawal"("status");
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: StoreItem
CREATE TABLE "StoreItem" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "pointsPrice" INTEGER,
    "rarity" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "StoreItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreItem_kind_itemId_key" ON "StoreItem"("kind", "itemId");

-- CreateTable: UserItem
CREATE TABLE "UserItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'purchase',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserItem_userId_kind_itemId_key" ON "UserItem"("userId", "kind", "itemId");
ALTER TABLE "UserItem" ADD CONSTRAINT "UserItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: PointEntry
CREATE TABLE "PointEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PointEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PointEntry_userId_idx" ON "PointEntry"("userId");
ALTER TABLE "PointEntry" ADD CONSTRAINT "PointEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: SupportTicket
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT,
    "email" TEXT,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportTicket_status_updatedAt_idx" ON "SupportTicket"("status", "updatedAt");
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: SupportMessage
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromAdmin" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Setting
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- ---------------------------------------------------------------
-- Seed de catálogo e parâmetros (idempotente — ON CONFLICT DO NOTHING)
-- ---------------------------------------------------------------

-- Presentes virtuais
INSERT INTO "GiftItem" ("id","name","emoji","priceCents","category","rarity","physical","baseSentCount","sortOrder","active") VALUES
 ('gi_biscoito','Biscoito da Sorte','🥠',1200,'popular economico','comum',false,214,1,true),
 ('gi_balao','Balão de Festa','🎈',800,'popular valioso','comum',false,1284,2,true),
 ('gi_coroa','Coroa de Aniversariante','👑',2500,'especial','lendario',false,96,3,true),
 ('gi_cafe','Vale Café','☕',600,'economico','comum',false,342,4,true),
 ('gi_chapeu','Chapéu de Festa Dourado','🎩',1800,'valioso','raro',false,187,5,true),
 ('gi_confete','Kit Confete','🎊',1000,'popular','comum',false,251,6,true),
 ('gi_bolo','Bolo Surpresa 3 Andares','🎂',3200,'especial valioso','epico',false,168,7,true),
 ('gi_vale5','Vale Compras R$5','🛍️',500,'economico','comum',false,412,8,true)
ON CONFLICT ("name") DO NOTHING;

-- Presentes físicos (parceiros)
INSERT INTO "GiftItem" ("id","name","emoji","priceCents","category","rarity","physical","partner","baseSentCount","sortOrder","active") VALUES
 ('gi_pao','Vale Pão — Padaria Doce Lar','🥖',1500,'fisico','raro',true,'Padaria Doce Lar',38,9,true),
 ('gi_buque','Buquê Pequeno — Floricultura Bela Flor','💐',4500,'fisico','epico',true,'Floricultura Bela Flor',52,10,true),
 ('gi_cappuccino','Cappuccino Especial — Cafeteria Grão','☕',1400,'fisico','raro',true,'Cafeteria Grão',61,11,true),
 ('gi_bolopote','Bolo de Pote — Doceria Da Vovó','🍰',2200,'fisico','raro',true,'Doceria Da Vovó',44,12,true)
ON CONFLICT ("name") DO NOTHING;

-- Torpedo (mensagem gratuita)
INSERT INTO "GiftItem" ("id","name","emoji","priceCents","category","rarity","physical","baseSentCount","sortOrder","active") VALUES
 ('gi_torpedo','Torpedo','💌',0,'torpedo','comum',false,0,99,true)
ON CONFLICT ("name") DO NOTHING;

-- Loja: molduras
INSERT INTO "StoreItem" ("id","kind","itemId","name","priceCents","pointsPrice","rarity","active","sortOrder") VALUES
 ('frame:cristal','frame','cristal','Moldura Cristal',3000,120,'comum',true,1),
 ('frame:estelar','frame','estelar','Moldura Estelar',3500,160,'raro',true,2),
 ('frame:aurora','frame','aurora','Moldura Aurora',4000,240,'epico',true,3),
 ('frame:aurea','frame','aurea','Moldura Áurea',6000,400,'lendario',true,4)
ON CONFLICT ("id") DO NOTHING;

-- Loja: decorações de festa
INSERT INTO "StoreItem" ("id","kind","itemId","name","priceCents","pointsPrice","rarity","active","sortOrder") VALUES
 ('accessory:confete','accessory','confete','Chuva de Confete',100,80,'comum',true,1),
 ('accessory:laco','accessory','laco','Laço de Festa',200,120,'raro',true,2),
 ('accessory:balao','accessory','balao','Balão de Festa',200,120,'raro',true,3),
 ('accessory:vela','accessory','vela','Velinha de Aniversário',300,200,'epico',true,4),
 ('accessory:chapeu-festa','accessory','chapeu-festa','Chapéu de Festa',400,NULL,'comum',true,5),
 ('accessory:coroa','accessory','coroa','Coroa de Aniversariante',500,320,'lendario',true,6)
ON CONFLICT ("id") DO NOTHING;

-- Parâmetros da plataforma
INSERT INTO "Setting" ("key","value","updatedAt") VALUES
 ('fee_percent','20',CURRENT_TIMESTAMP),
 ('min_withdraw_reais','10',CURRENT_TIMESTAMP),
 ('instant_fee_percent','6',CURRENT_TIMESTAMP),
 ('points_per_gift','40',CURRENT_TIMESTAMP),
 ('points_mission_bonus','80',CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
