
-- ============================================================
-- MIGRATION: Novos valores para quote_status
-- Contexto: UI de orçamentos amplia o fluxo de status.
-- Executado em transação separada (requisito do ADD VALUE).
-- ============================================================
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'enviado';
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'em_analise';
