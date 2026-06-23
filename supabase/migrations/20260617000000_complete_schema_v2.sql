
-- ============================================================
-- MIGRATION: Complete Schema v2 — Funilaria e Pintura
-- Complementa a estrutura existente sem recriar objetos.
-- Ordem: enums → colunas → constraints → índices →
--        novas tabelas → views → funções/triggers
-- ============================================================

-- ============================================================
-- 1. CLIENTES — campos de endereço completo + CPF/CNPJ único
-- ============================================================
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS cpf_cnpj            TEXT,
  ADD COLUMN IF NOT EXISTS telefone_secundario  TEXT,
  ADD COLUMN IF NOT EXISTS cep                  TEXT,
  ADD COLUMN IF NOT EXISTS numero               TEXT,
  ADD COLUMN IF NOT EXISTS complemento          TEXT,
  ADD COLUMN IF NOT EXISTS bairro               TEXT,
  ADD COLUMN IF NOT EXISTS cidade               TEXT,
  ADD COLUMN IF NOT EXISTS estado               CHAR(2);

-- CPF/CNPJ único (NULLs nunca violam UNIQUE no PostgreSQL)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'clients_cpf_cnpj_unique'
      AND table_schema = 'public' AND table_name = 'clients'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_cpf_cnpj_unique UNIQUE (cpf_cnpj);
  END IF;
END $$;

-- Índices de pesquisa rápida em clientes
CREATE INDEX IF NOT EXISTS idx_clients_name_fts
  ON public.clients USING gin(to_tsvector('portuguese', name));
CREATE INDEX IF NOT EXISTS idx_clients_phone
  ON public.clients(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_cpf_cnpj
  ON public.clients(cpf_cnpj) WHERE cpf_cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_cidade
  ON public.clients(cidade) WHERE cidade IS NOT NULL;

-- ============================================================
-- 2. VEÍCULOS — combustível + placa única + índices
-- ============================================================
CREATE TYPE public.combustivel_type AS ENUM (
  'gasolina', 'etanol', 'flex', 'diesel', 'gnv', 'eletrico', 'hibrido'
);

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS combustivel public.combustivel_type;

-- Placa única (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'vehicles_plate_unique'
      AND table_schema = 'public' AND table_name = 'vehicles'
  ) THEN
    ALTER TABLE public.vehicles
      ADD CONSTRAINT vehicles_plate_unique UNIQUE (plate);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vehicles_plate  ON public.vehicles(plate);
CREATE INDEX IF NOT EXISTS idx_vehicles_brand  ON public.vehicles(brand);
CREATE INDEX IF NOT EXISTS idx_vehicles_year   ON public.vehicles(year);

-- ============================================================
-- 3. ENUMS — novos valores
-- (ALTER TYPE ADD VALUE foi movido para 20260616000002_enum_additions.sql
--  para evitar SQLSTATE 55P04: os valores precisam existir numa transação
--  anterior antes de serem usados em views/funções)
-- ============================================================

-- 3.1 quote_status e item_type: ver migration 20260616000002_enum_additions.sql

-- 3.2 forma_pagamento (enum dedicado para movimentações)
DO $$ BEGIN
  CREATE TYPE public.forma_pagamento AS ENUM (
    'dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'transferencia', 'boleto'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 4. FINANCIAL TRANSACTIONS — campos adicionais
-- ============================================================
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS data_movimentacao DATE,
  ADD COLUMN IF NOT EXISTS forma_pagamento   public.forma_pagamento;

-- Preenche data_movimentacao a partir dos campos existentes
UPDATE public.financial_transactions
SET data_movimentacao = COALESCE(paid_date, due_date)
WHERE data_movimentacao IS NULL;

CREATE INDEX IF NOT EXISTS idx_ft_type_status
  ON public.financial_transactions(type, status);
CREATE INDEX IF NOT EXISTS idx_ft_data_mov
  ON public.financial_transactions(data_movimentacao DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ft_due_date
  ON public.financial_transactions(due_date);
CREATE INDEX IF NOT EXISTS idx_ft_client
  ON public.financial_transactions(client_id) WHERE client_id IS NOT NULL;

-- ============================================================
-- 5. ÍNDICES em tabelas existentes (quotes, service_orders)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_quotes_client
  ON public.quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status
  ON public.quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_created
  ON public.quotes(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_so_client
  ON public.service_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_so_status
  ON public.service_orders(status);
CREATE INDEX IF NOT EXISTS idx_so_number
  ON public.service_orders(number DESC);

-- ============================================================
-- 6. AGENDAMENTOS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.agendamento_status AS ENUM (
    'agendado', 'confirmado', 'em_atendimento',
    'concluido', 'cancelado', 'nao_compareceu'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.agendamentos (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     UUID        NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  veiculo_id     UUID        REFERENCES public.vehicles(id) ON DELETE SET NULL,
  data_agendada  TIMESTAMPTZ NOT NULL,
  tipo_servico   TEXT,
  observacoes    TEXT,
  status         public.agendamento_status NOT NULL DEFAULT 'agendado',
  created_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_data
  ON public.agendamentos(data_agendada);
CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente
  ON public.agendamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status
  ON public.agendamentos(status);
-- Índice parcial: agendamentos futuros (consulta mais comum)
CREATE INDEX IF NOT EXISTS idx_agendamentos_futuros
  ON public.agendamentos(data_agendada)
  WHERE status IN ('agendado', 'confirmado');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agendamentos TO authenticated;
GRANT ALL ON public.agendamentos TO service_role;

ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view agendamentos" ON public.agendamentos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert agendamentos" ON public.agendamentos
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "update agendamentos" ON public.agendamentos
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "delete agendamentos (admin/manager)" ON public.agendamentos
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE TRIGGER agendamentos_set_updated_at
  BEFORE UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 7. SERVICOS — execução técnica ligada a uma OS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.servico_status AS ENUM (
    'nao_iniciado', 'em_andamento', 'aguardando_peca', 'finalizado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.servicos (
  id               UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID       NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  data_inicio      DATE,
  data_previsao    DATE,
  data_conclusao   DATE,
  status           public.servico_status NOT NULL DEFAULT 'nao_iniciado',
  observacoes      TEXT,
  responsavel_id   UUID       REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by       UUID       REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Garante que a conclusão não seja antes do início
  CONSTRAINT servicos_datas_check
    CHECK (data_conclusao IS NULL OR data_inicio IS NULL OR data_conclusao >= data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_servicos_order
  ON public.servicos(order_id);
CREATE INDEX IF NOT EXISTS idx_servicos_status
  ON public.servicos(status);
CREATE INDEX IF NOT EXISTS idx_servicos_previsao
  ON public.servicos(data_previsao)
  WHERE status != 'finalizado';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicos TO authenticated;
GRANT ALL ON public.servicos TO service_role;

ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view servicos" ON public.servicos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert servicos" ON public.servicos
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "update servicos" ON public.servicos
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "delete servicos (admin/manager)" ON public.servicos
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE TRIGGER servicos_set_updated_at
  BEFORE UPDATE ON public.servicos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 8. VIEWS
-- ============================================================

-- 8.1 Resumo financeiro mensal
CREATE OR REPLACE VIEW public.vw_resumo_financeiro AS
SELECT
  DATE_TRUNC('month',
    COALESCE(ft.data_movimentacao, ft.paid_date, ft.due_date, ft.created_at::date)
  )::date                                                                     AS mes,
  COUNT(*)  FILTER (WHERE ft.type = 'receita' AND ft.status = 'pago')        AS qtd_receitas,
  COUNT(*)  FILTER (WHERE ft.type = 'despesa' AND ft.status = 'pago')        AS qtd_despesas,
  COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'receita' AND ft.status = 'pago'), 0)
                                                                              AS total_receitas,
  COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'despesa' AND ft.status = 'pago'), 0)
                                                                              AS total_despesas,
  COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'receita' AND ft.status = 'pago'), 0)
  - COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'despesa' AND ft.status = 'pago'), 0)
                                                                              AS saldo,
  COALESCE(SUM(ft.amount) FILTER (WHERE ft.status = 'pendente'), 0)          AS total_pendente,
  COALESCE(SUM(ft.amount) FILTER (WHERE ft.status = 'atrasado'), 0)          AS total_atrasado
FROM public.financial_transactions ft
GROUP BY 1
ORDER BY 1 DESC;

GRANT SELECT ON public.vw_resumo_financeiro TO authenticated;

-- 8.2 Orçamentos pendentes / aguardando ação
CREATE OR REPLACE VIEW public.vw_orcamentos_pendentes AS
SELECT
  q.id,
  q.number                               AS numero_orcamento,
  q.created_at                           AS data_orcamento,
  q.status,
  q.total                                AS valor_total,
  COALESCE(q.discount, 0)                AS desconto,
  q.total - COALESCE(q.discount, 0)      AS valor_final,
  q.valid_until                          AS validade,
  CASE
    WHEN q.valid_until < CURRENT_DATE THEN true
    ELSE false
  END                                    AS vencido,
  c.id                                   AS cliente_id,
  c.name                                 AS cliente_nome,
  c.phone                                AS cliente_telefone,
  c.cpf_cnpj                             AS cliente_cpf_cnpj,
  v.id                                   AS veiculo_id,
  v.brand                                AS veiculo_marca,
  v.model                                AS veiculo_modelo,
  v.plate                                AS veiculo_placa,
  v.year                                 AS veiculo_ano,
  v.color                                AS veiculo_cor
FROM public.quotes q
JOIN  public.clients  c ON c.id = q.client_id
LEFT JOIN public.vehicles v ON v.id = q.vehicle_id
WHERE q.status IN ('pendente', 'aguardando_aprovacao', 'rascunho')
ORDER BY q.created_at DESC;

GRANT SELECT ON public.vw_orcamentos_pendentes TO authenticated;

-- 8.3 Veículos em execução na oficina
CREATE OR REPLACE VIEW public.vw_veiculos_em_execucao AS
SELECT
  v.id,
  v.plate                                AS placa,
  v.brand                                AS marca,
  v.model                                AS modelo,
  v.year                                 AS ano,
  v.color                                AS cor,
  v.status,
  v.entry_date                           AS data_entrada,
  v.expected_delivery                    AS previsao_entrega,
  (CURRENT_DATE - v.entry_date)          AS dias_na_oficina,
  CASE
    WHEN v.expected_delivery IS NOT NULL AND v.expected_delivery < CURRENT_DATE THEN true
    ELSE false
  END                                    AS atrasado,
  c.id                                   AS cliente_id,
  c.name                                 AS cliente_nome,
  c.phone                                AS cliente_telefone,
  so.id                                  AS order_id,
  so.number                              AS numero_os,
  so.status                              AS status_os,
  so.total                               AS valor_os
FROM public.vehicles v
JOIN  public.clients c ON c.id = v.client_id
LEFT JOIN public.service_orders so
  ON so.vehicle_id = v.id
  AND so.status NOT IN ('concluida', 'cancelada')
WHERE v.status IN ('em_analise', 'em_manutencao', 'pintura', 'finalizacao')
ORDER BY v.entry_date;

GRANT SELECT ON public.vw_veiculos_em_execucao TO authenticated;

-- ============================================================
-- 9. FUNÇÕES SQL
-- ============================================================

-- 9.1 Calcular valor total de um orçamento (soma dos itens)
CREATE OR REPLACE FUNCTION public.calcular_total_orcamento(p_quote_id UUID)
RETURNS NUMERIC(12,2)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT COALESCE(SUM(total), 0)::NUMERIC(12,2)
  FROM public.quote_items
  WHERE quote_id = p_quote_id;
$$;

GRANT EXECUTE ON FUNCTION public.calcular_total_orcamento(UUID) TO authenticated;

-- 9.2 Calcular valor total de uma OS (soma dos itens)
CREATE OR REPLACE FUNCTION public.calcular_total_os(p_order_id UUID)
RETURNS NUMERIC(12,2)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT COALESCE(SUM(total), 0)::NUMERIC(12,2)
  FROM public.service_order_items
  WHERE order_id = p_order_id;
$$;

GRANT EXECUTE ON FUNCTION public.calcular_total_os(UUID) TO authenticated;

-- 9.3 Próximo número de orçamento (expõe a sequence existente)
CREATE OR REPLACE FUNCTION public.proximo_numero_orcamento()
RETURNS INTEGER
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = public
AS $$
  SELECT nextval('public.quote_number_seq')::INTEGER;
$$;

GRANT EXECUTE ON FUNCTION public.proximo_numero_orcamento() TO authenticated;

-- 9.4 Próximo número de OS (expõe a sequence existente)
CREATE OR REPLACE FUNCTION public.proximo_numero_os()
RETURNS INTEGER
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = public
AS $$
  SELECT nextval('public.service_order_number_seq')::INTEGER;
$$;

GRANT EXECUTE ON FUNCTION public.proximo_numero_os() TO authenticated;

-- ============================================================
-- 10. TRIGGERS — sincronização automática de totais
-- ============================================================

-- 10.1 Atualiza quotes.total quando quote_items muda
CREATE OR REPLACE FUNCTION public.sync_quote_total()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_quote_id UUID := COALESCE(NEW.quote_id, OLD.quote_id);
BEGIN
  UPDATE public.quotes
  SET
    total      = (SELECT COALESCE(SUM(total), 0) FROM public.quote_items WHERE quote_id = v_quote_id),
    updated_at = now()
  WHERE id = v_quote_id;
  RETURN COALESCE(NEW, OLD);
END $$;

REVOKE EXECUTE ON FUNCTION public.sync_quote_total() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_quote_total ON public.quote_items;
CREATE TRIGGER trg_sync_quote_total
  AFTER INSERT OR UPDATE OF quantity, unit_price, total OR DELETE
  ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_quote_total();

-- 10.2 Atualiza service_orders.total quando service_order_items muda
CREATE OR REPLACE FUNCTION public.sync_os_total()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_order_id UUID := COALESCE(NEW.order_id, OLD.order_id);
BEGIN
  UPDATE public.service_orders
  SET
    total      = (SELECT COALESCE(SUM(total), 0) FROM public.service_order_items WHERE order_id = v_order_id),
    updated_at = now()
  WHERE id = v_order_id;
  RETURN COALESCE(NEW, OLD);
END $$;

REVOKE EXECUTE ON FUNCTION public.sync_os_total() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_os_total ON public.service_order_items;
CREATE TRIGGER trg_sync_os_total
  AFTER INSERT OR UPDATE OF quantity, unit_price, total OR DELETE
  ON public.service_order_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_os_total();

-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
