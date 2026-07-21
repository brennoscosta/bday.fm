-- Novo tipo de lançamento na carteira: depósito validado via Mercado Pago
ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'DEPOSIT_MP';
