-- ============================================================
-- MIGRATION: Adiciona valores novos nos enums existentes
--
-- Precisa rodar em transação SEPARADA das views/funções que
-- usam esses valores (restrição do PostgreSQL: SQLSTATE 55P04).
-- Por isso fica num arquivo anterior ao complete_schema_v2.
-- ============================================================

-- quote_status: ciclo completo de orçamento
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'rascunho';
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'aguardando_aprovacao';
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'em_execucao';
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'finalizado';
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'cancelado';

-- item_type: subtipos de serviço de funilaria
ALTER TYPE public.item_type ADD VALUE IF NOT EXISTS 'funilaria';
ALTER TYPE public.item_type ADD VALUE IF NOT EXISTS 'pintura';
ALTER TYPE public.item_type ADD VALUE IF NOT EXISTS 'mao_de_obra';
ALTER TYPE public.item_type ADD VALUE IF NOT EXISTS 'outro';
