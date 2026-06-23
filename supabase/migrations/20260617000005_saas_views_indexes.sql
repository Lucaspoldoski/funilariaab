
-- ============================================================
-- MIGRATION 5/5: SaaS — Dashboard Views + Índices Otimizados
-- ============================================================
-- Todas as views usam security_invoker = on (PG 15+):
--   O PostgreSQL aplica o RLS das tabelas subjacentes com as
--   credenciais do usuário logado → cada empresa vê apenas
--   seus próprios dados sem filtro explícito na view.
--
-- Índices desta migration: compostos e de texto (FTS) para
--   as buscas mais comuns em uma oficina (placa, telefone,
--   cpf_cnpj, nome do cliente).
-- ============================================================

-- ============================================================
-- PARTE A: Remove views antigas (serão recriadas com security_invoker)
-- ============================================================
DROP VIEW IF EXISTS public.vw_resumo_financeiro    CASCADE;
DROP VIEW IF EXISTS public.vw_orcamentos_pendentes CASCADE;
DROP VIEW IF EXISTS public.vw_veiculos_em_execucao CASCADE;

-- ============================================================
-- PARTE B: VIEW 1 — Faturamento Mensal
--    Receitas, despesas, saldo e pendências por mês.
--    Cada empresa vê apenas o SEU faturamento (via RLS).
-- ============================================================
CREATE OR REPLACE VIEW public.vw_faturamento_mensal
  WITH (security_invoker = on)
AS
SELECT
  DATE_TRUNC('month',
    COALESCE(ft.data_movimentacao, ft.paid_date, ft.due_date, ft.created_at::date)
  )::date                                                                         AS mes,

  COUNT(*) FILTER (WHERE ft.type = 'receita' AND ft.status = 'pago')             AS qtd_receitas,
  COUNT(*) FILTER (WHERE ft.type = 'despesa' AND ft.status = 'pago')             AS qtd_despesas,

  COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'receita' AND ft.status = 'pago'), 0)
                                                                                  AS total_receitas,
  COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'despesa' AND ft.status = 'pago'), 0)
                                                                                  AS total_despesas,

  -- Saldo do mês (receitas pagas − despesas pagas)
  COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'receita' AND ft.status = 'pago'), 0)
  - COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'despesa' AND ft.status = 'pago'), 0)
                                                                                  AS saldo_mes,

  -- Valores ainda a receber / a pagar
  COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'receita' AND ft.status = 'pendente'), 0)
                                                                                  AS a_receber,
  COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'despesa' AND ft.status = 'pendente'), 0)
                                                                                  AS a_pagar,

  -- Valores em atraso
  COALESCE(SUM(ft.amount) FILTER (WHERE ft.status = 'atrasado'), 0)              AS total_atrasado,

  ft.empresa_id
FROM public.financial_transactions ft
GROUP BY ft.empresa_id, 1
ORDER BY 1 DESC;

GRANT SELECT ON public.vw_faturamento_mensal TO authenticated;

-- ============================================================
-- PARTE C: VIEW 2 — Estoque Baixo
--    Peças com quantidade ≤ quantidade_minima.
--    Alimenta alertas no dashboard.
-- ============================================================
CREATE OR REPLACE VIEW public.vw_estoque_baixo
  WITH (security_invoker = on)
AS
SELECT
  ep.id,
  ep.empresa_id,
  ep.codigo,
  ep.descricao,
  ep.fabricante,
  ep.unidade,
  ep.quantidade,
  ep.quantidade_minima,
  ep.quantidade_minima - ep.quantidade   AS deficit,
  ep.valor_custo,
  ep.valor_venda,
  ep.localizacao,
  ep.updated_at                          AS ultima_movimentacao
FROM public.estoque_pecas ep
WHERE
  ep.ativo = true
  AND ep.quantidade <= ep.quantidade_minima
ORDER BY
  (ep.quantidade_minima - ep.quantidade) DESC,  -- maior déficit primeiro
  ep.descricao;

GRANT SELECT ON public.vw_estoque_baixo TO authenticated;

-- ============================================================
-- PARTE D: VIEW 3 — Orçamentos Pendentes
--    Orçamentos aguardando ação (rascunho / aguardando aprovação).
-- ============================================================
CREATE OR REPLACE VIEW public.vw_orcamentos_pendentes
  WITH (security_invoker = on)
AS
SELECT
  q.id,
  q.empresa_id,
  q.number                                 AS numero_orcamento,
  q.created_at                             AS data_orcamento,
  q.status,
  q.total                                  AS valor_total,
  COALESCE(q.discount, 0)                  AS desconto,
  q.total - COALESCE(q.discount, 0)        AS valor_final,
  q.valid_until                            AS validade,

  -- Flag de vencimento
  CASE
    WHEN q.valid_until IS NOT NULL AND q.valid_until < CURRENT_DATE THEN true
    ELSE false
  END                                      AS vencido,

  -- Tempo em aberto
  (CURRENT_DATE - q.created_at::date)      AS dias_em_aberto,

  -- Cliente
  c.id                                     AS cliente_id,
  c.name                                   AS cliente_nome,
  c.phone                                  AS cliente_telefone,
  c.whatsapp                               AS cliente_whatsapp,
  c.cpf_cnpj                               AS cliente_cpf_cnpj,

  -- Veículo
  v.id                                     AS veiculo_id,
  v.brand                                  AS veiculo_marca,
  v.model                                  AS veiculo_modelo,
  v.year                                   AS veiculo_ano,
  v.plate                                  AS veiculo_placa,
  v.color                                  AS veiculo_cor,

  -- Criador do orçamento
  p.full_name                              AS criado_por_nome,
  q.created_by                             AS criado_por_id

FROM public.quotes q
JOIN  public.clients  c ON c.id = q.client_id
LEFT JOIN public.vehicles v ON v.id = q.vehicle_id
LEFT JOIN public.profiles p ON p.id = q.created_by
WHERE q.status IN ('pendente', 'aguardando_aprovacao', 'rascunho')
ORDER BY q.created_at DESC;

GRANT SELECT ON public.vw_orcamentos_pendentes TO authenticated;

-- ============================================================
-- PARTE E: VIEW 4 — Serviços em Andamento
--    OS e serviços ativos com detalhes do veículo e cliente.
-- ============================================================
CREATE OR REPLACE VIEW public.vw_servicos_em_andamento
  WITH (security_invoker = on)
AS
SELECT
  s.id                                     AS servico_id,
  s.empresa_id,
  s.status                                 AS status_servico,
  s.data_inicio,
  s.data_previsao,
  s.data_conclusao,
  s.observacoes                            AS obs_servico,

  -- Prazo
  CASE
    WHEN s.data_previsao IS NOT NULL AND s.data_previsao < CURRENT_DATE
         AND s.status != 'finalizado' THEN true
    ELSE false
  END                                      AS atrasado,
  CASE
    WHEN s.data_previsao IS NOT NULL
    THEN (s.data_previsao - CURRENT_DATE)
    ELSE NULL
  END                                      AS dias_para_prazo,

  -- OS
  so.id                                    AS order_id,
  so.number                                AS numero_os,
  so.status                                AS status_os,
  so.total                                 AS valor_os,
  so.description                           AS descricao_os,

  -- Veículo
  v.id                                     AS veiculo_id,
  v.plate                                  AS placa,
  v.brand                                  AS marca,
  v.model                                  AS modelo,
  v.year                                   AS ano,
  v.color                                  AS cor,
  v.status                                 AS status_veiculo,
  v.entry_date                             AS data_entrada,
  (CURRENT_DATE - v.entry_date)            AS dias_na_oficina,

  -- Cliente
  c.id                                     AS cliente_id,
  c.name                                   AS cliente_nome,
  c.phone                                  AS cliente_telefone,
  c.whatsapp                               AS cliente_whatsapp,

  -- Responsável
  p.full_name                              AS responsavel_nome,
  s.responsavel_id

FROM public.servicos s
JOIN  public.service_orders so ON so.id = s.order_id
JOIN  public.vehicles        v  ON v.id  = so.vehicle_id
JOIN  public.clients         c  ON c.id  = so.client_id
LEFT JOIN public.profiles    p  ON p.id  = s.responsavel_id
WHERE s.status IN ('nao_iniciado', 'em_andamento', 'aguardando_peca')
ORDER BY
  s.data_previsao ASC NULLS LAST,
  s.data_inicio   ASC NULLS LAST;

GRANT SELECT ON public.vw_servicos_em_andamento TO authenticated;

-- ============================================================
-- PARTE F: VIEW 5 — Veículos em Execução (atualizada)
-- ============================================================
CREATE OR REPLACE VIEW public.vw_veiculos_em_execucao
  WITH (security_invoker = on)
AS
SELECT
  v.id,
  v.empresa_id,
  v.plate                                  AS placa,
  v.brand                                  AS marca,
  v.model                                  AS modelo,
  v.year                                   AS ano,
  v.color                                  AS cor,
  v.status,
  v.entry_date                             AS data_entrada,
  v.expected_delivery                      AS previsao_entrega,
  (CURRENT_DATE - v.entry_date)            AS dias_na_oficina,

  CASE
    WHEN v.expected_delivery IS NOT NULL AND v.expected_delivery < CURRENT_DATE THEN true
    ELSE false
  END                                      AS atrasado,

  c.id                                     AS cliente_id,
  c.name                                   AS cliente_nome,
  c.phone                                  AS cliente_telefone,
  c.whatsapp                               AS cliente_whatsapp,

  so.id                                    AS order_id,
  so.number                                AS numero_os,
  so.status                                AS status_os,
  so.total                                 AS valor_os

FROM public.vehicles v
JOIN  public.clients c ON c.id = v.client_id
LEFT JOIN public.service_orders so
  ON so.vehicle_id = v.id
  AND so.status NOT IN ('concluida', 'cancelada')
WHERE v.status IN ('em_analise', 'em_manutencao', 'pintura', 'finalizacao')
ORDER BY v.entry_date;

GRANT SELECT ON public.vw_veiculos_em_execucao TO authenticated;

-- ============================================================
-- PARTE G: ÍNDICES DE BUSCA FULL-TEXT E COMPOSTOS
--
-- Padrão de nomenclatura:
--   idx_{tabela}_{campos}
--
-- GIN para FTS: suporta busca por prefixo, token, similaridade
-- BTREE compostos: (empresa_id, campo) para filtros + ordenação
-- ============================================================

-- ---- Busca por placa (case-insensitive) ----
-- Expressional index: normaliza placa para busca sem hífen e maiúsculas
CREATE INDEX IF NOT EXISTS idx_vehicles_plate_norm
  ON public.vehicles(empresa_id, upper(regexp_replace(plate, '[^A-Za-z0-9]', '', 'g')));

-- ---- Busca por telefone (dígitos apenas) ----
CREATE INDEX IF NOT EXISTS idx_clients_phone_digits
  ON public.clients(empresa_id, regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'))
  WHERE empresa_id IS NOT NULL AND phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_whatsapp_digits
  ON public.clients(empresa_id, regexp_replace(COALESCE(whatsapp, ''), '[^0-9]', '', 'g'))
  WHERE empresa_id IS NOT NULL AND whatsapp IS NOT NULL;

-- ---- Busca por CPF/CNPJ (dígitos apenas) ----
CREATE INDEX IF NOT EXISTS idx_clients_cpf_digits
  ON public.clients(empresa_id, regexp_replace(COALESCE(cpf_cnpj, ''), '[^0-9]', '', 'g'))
  WHERE empresa_id IS NOT NULL AND cpf_cnpj IS NOT NULL;

-- ---- Full-text search em nome do cliente ----
-- GIN com configuração portuguese para tokenização de nomes brasileiros
CREATE INDEX IF NOT EXISTS idx_clients_name_fts_pt
  ON public.clients USING gin(to_tsvector('portuguese', name));

-- ---- Full-text search em descrição de peças ----
CREATE INDEX IF NOT EXISTS idx_ep_descricao_fts
  ON public.estoque_pecas USING gin(to_tsvector('portuguese', descricao));

-- ---- Índices de tempo para relatórios ----
-- Faturamento: range queries por mês
-- Nota: COALESCE apenas sobre colunas DATE (imutáveis). created_at (TIMESTAMPTZ→DATE)
-- removido pois a conversão depende do timezone da sessão (não IMMUTABLE).
CREATE INDEX IF NOT EXISTS idx_ft_emp_mes
  ON public.financial_transactions(
    empresa_id,
    DATE_TRUNC('month', COALESCE(data_movimentacao, paid_date, due_date)::timestamp)
  ) WHERE empresa_id IS NOT NULL AND COALESCE(data_movimentacao, paid_date, due_date) IS NOT NULL;

-- Agendamentos: busca de agenda por dia/semana
-- Nota: data_agendada é TIMESTAMPTZ. Índice simples por coluna (sem cast, sem problema IMMUTABLE).
CREATE INDEX IF NOT EXISTS idx_agend_emp_dia
  ON public.agendamentos(
    empresa_id,
    data_agendada,
    status
  ) WHERE empresa_id IS NOT NULL;

-- ---- Índice em service_orders para dashboard de OS ----
CREATE INDEX IF NOT EXISTS idx_so_emp_vehicle_status
  ON public.service_orders(empresa_id, vehicle_id, status)
  WHERE empresa_id IS NOT NULL AND status NOT IN ('concluida', 'cancelada');

-- ---- Estoque: cobertura para a view vw_estoque_baixo ----
-- Index covering: engine pode satisfazer a query só pelo índice
CREATE INDEX IF NOT EXISTS idx_ep_baixo_covering
  ON public.estoque_pecas(empresa_id, quantidade, quantidade_minima, ativo)
  INCLUDE (codigo, descricao, unidade, localizacao)
  WHERE ativo = true;

-- ============================================================
-- PARTE H: FUNÇÃO DE BUSCA UNIFICADA (full-text + filters)
--    Busca clientes por nome, telefone ou CPF/CNPJ de forma
--    normalizada — retorna rows da tabela clients.
-- ============================================================
CREATE OR REPLACE FUNCTION public.buscar_clientes(
  p_termo   TEXT,
  p_limit   INTEGER DEFAULT 20,
  p_offset  INTEGER DEFAULT 0
)
RETURNS SETOF public.clients
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH termo_normalizado AS (
    SELECT
      lower(trim(p_termo))                                        AS raw,
      regexp_replace(p_termo, '[^0-9]', '', 'g')                  AS digits_only,
      to_tsquery('portuguese',
        string_agg(lexeme, ' & ')
      )                                                            AS tsq
    FROM unnest(
      tsvector_to_array(to_tsvector('portuguese', p_termo))
    ) AS lexeme
  )
  SELECT c.*
  FROM public.clients c, termo_normalizado t
  WHERE
    c.empresa_id = public.get_empresa_id()
    AND (
      -- FTS no nome
      to_tsvector('portuguese', c.name) @@ t.tsq
      -- Contém no nome (fallback ILIKE)
      OR c.name ILIKE '%' || t.raw || '%'
      -- Telefone por dígitos
      OR (length(t.digits_only) >= 8 AND
          regexp_replace(COALESCE(c.phone,''), '[^0-9]', '', 'g') LIKE t.digits_only || '%')
      -- WhatsApp por dígitos
      OR (length(t.digits_only) >= 8 AND
          regexp_replace(COALESCE(c.whatsapp,''), '[^0-9]', '', 'g') LIKE t.digits_only || '%')
      -- CPF/CNPJ por dígitos
      OR (length(t.digits_only) >= 6 AND
          regexp_replace(COALESCE(c.cpf_cnpj,''), '[^0-9]', '', 'g') LIKE t.digits_only || '%')
    )
  ORDER BY
    -- Prioriza match exato de telefone/CPF sobre FTS
    CASE
      WHEN regexp_replace(COALESCE(c.phone,''), '[^0-9]', '', 'g') = t.digits_only THEN 0
      WHEN regexp_replace(COALESCE(c.cpf_cnpj,''), '[^0-9]', '', 'g') = t.digits_only THEN 1
      WHEN c.name ILIKE t.raw || '%' THEN 2
      ELSE 3
    END,
    c.name
  LIMIT p_limit OFFSET p_offset;
$$;

REVOKE EXECUTE ON FUNCTION public.buscar_clientes(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.buscar_clientes(TEXT, INTEGER, INTEGER) TO authenticated;

-- ============================================================
-- PARTE I: FUNÇÃO DE BUSCA DE VEÍCULO POR PLACA
--    Normaliza placa antes de buscar (remove traços, maiúsculas)
-- ============================================================
CREATE OR REPLACE FUNCTION public.buscar_veiculo_por_placa(p_placa TEXT)
RETURNS SETOF public.vehicles
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT v.*
  FROM public.vehicles v
  WHERE
    v.empresa_id = public.get_empresa_id()
    AND upper(regexp_replace(v.plate, '[^A-Za-z0-9]', '', 'g'))
      = upper(regexp_replace(p_placa, '[^A-Za-z0-9]', '', 'g'))
  ORDER BY v.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.buscar_veiculo_por_placa(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.buscar_veiculo_por_placa(TEXT) TO authenticated;

-- ============================================================
-- FIM DA MIGRATION 5/5 — Estrutura SaaS completa
-- ============================================================
