-- Novos tipos de lançamento no ledger da carteira.
-- Mantidos em migration própria: valor novo de enum não pode ser usado
-- na mesma transação em que é criado (limitação do Postgres).
ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'GIFT_SENT';
ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'STORE_PURCHASE';
