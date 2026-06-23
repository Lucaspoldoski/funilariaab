
-- ============================================================
-- MIGRATION 3/5: SaaS — Estoque de Peças
-- ============================================================
-- Tabelas: estoque_pecas, movimentacao_estoque
-- Lógica: trigger BEFORE INSERT valida e aplica a movimentação
--         atomicamente, prevenindo race conditions.
-- ============================================================

-- ============================================================
-- 1. ENUM: tipo de movimentação de estoque
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.movimentacao_tipo AS ENUM ('entrada', 'saida', 'ajuste');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. TABELA: estoque_pecas
--    Catálogo de peças com controle de quantidade por empresa.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.estoque_pecas (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         UUID          NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  codigo             TEXT,                             -- SKU / código interno da oficina
  descricao          TEXT          NOT NULL,
  fabricante         TEXT,
  unidade            TEXT          NOT NULL DEFAULT 'un',  -- un, L, kg, m, par…
  quantidade         NUMERIC(12,3) NOT NULL DEFAULT 0  CHECK (quantidade >= 0),
  quantidade_minima  NUMERIC(12,3) NOT NULL DEFAULT 0  CHECK (quantidade_minima >= 0),
  valor_custo        NUMERIC(12,2) NOT NULL DEFAULT 0  CHECK (valor_custo >= 0),
  valor_venda        NUMERIC(12,2) NOT NULL DEFAULT 0  CHECK (valor_venda >= 0),
  localizacao        TEXT,                             -- prateleira / bin / gaveta
  ativo              BOOLEAN       NOT NULL DEFAULT true,
  observacoes        TEXT,
  created_by         UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- Código único por empresa (NULL não viola UNIQUE)
  UNIQUE NULLS NOT DISTINCT (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_ep_empresa_ativo
  ON public.estoque_pecas(empresa_id, ativo) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_ep_empresa_descricao
  ON public.estoque_pecas(empresa_id, descricao) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ep_empresa_codigo
  ON public.estoque_pecas(empresa_id, codigo) WHERE codigo IS NOT NULL;
-- Índice parcial para alerta de estoque baixo (quantidade <= quantidade_minima)
CREATE INDEX IF NOT EXISTS idx_ep_estoque_baixo
  ON public.estoque_pecas(empresa_id, quantidade, quantidade_minima)
  WHERE ativo = true AND quantidade <= quantidade_minima;

CREATE TRIGGER estoque_pecas_set_updated_at
  BEFORE UPDATE ON public.estoque_pecas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.estoque_pecas TO authenticated;
GRANT ALL ON public.estoque_pecas TO service_role;
ALTER TABLE public.estoque_pecas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ep: select"
  ON public.estoque_pecas FOR SELECT TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ep: insert (admin/manager)"
  ON public.estoque_pecas FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = public.get_empresa_id()
    AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager'))
  );

CREATE POLICY "ep: update (admin/manager)"
  ON public.estoque_pecas FOR UPDATE TO authenticated
  USING (
    (empresa_id = public.get_empresa_id()
      AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager')))
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    (empresa_id = public.get_empresa_id()
      AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager')))
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "ep: delete (admin)"
  ON public.estoque_pecas FOR DELETE TO authenticated
  USING (
    empresa_id = public.get_empresa_id()
    AND public.empresa_has_role('admin')
  );

-- ============================================================
-- 3. TABELA: movimentacao_estoque
--    Registro imutável de todas as entradas/saídas/ajustes.
--    A quantidade na peça é atualizada atomicamente pelo trigger.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.movimentacao_estoque (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID          NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  peca_id             UUID          NOT NULL REFERENCES public.estoque_pecas(id) ON DELETE RESTRICT,
  tipo                public.movimentacao_tipo NOT NULL,

  -- Semântica por tipo:
  --   entrada → quantidade = unidades que entraram (positivo)
  --   saida   → quantidade = unidades que saíram  (positivo)
  --   ajuste  → quantidade = novo valor ABSOLUTO do estoque
  quantidade          NUMERIC(12,3) NOT NULL CHECK (quantidade >= 0),

  quantidade_anterior NUMERIC(12,3) NOT NULL DEFAULT 0, -- preenchido pelo trigger
  quantidade_nova     NUMERIC(12,3) NOT NULL DEFAULT 0, -- preenchido pelo trigger

  custo_unitario      NUMERIC(12,2),                    -- custo na época da movimentação
  order_id            UUID          REFERENCES public.service_orders(id) ON DELETE SET NULL,
  motivo              TEXT,
  created_by          UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
  -- Sem updated_at: registros de movimentação são imutáveis após criação
);

CREATE INDEX IF NOT EXISTS idx_me_empresa_peca
  ON public.movimentacao_estoque(empresa_id, peca_id);
CREATE INDEX IF NOT EXISTS idx_me_empresa_created
  ON public.movimentacao_estoque(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_me_peca_created
  ON public.movimentacao_estoque(peca_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_me_order
  ON public.movimentacao_estoque(order_id) WHERE order_id IS NOT NULL;

GRANT SELECT, INSERT ON public.movimentacao_estoque TO authenticated;
GRANT ALL ON public.movimentacao_estoque TO service_role;
ALTER TABLE public.movimentacao_estoque ENABLE ROW LEVEL SECURITY;

CREATE POLICY "me: select (admin/manager)"
  ON public.movimentacao_estoque FOR SELECT TO authenticated
  USING (
    (empresa_id = public.get_empresa_id()
      AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager')))
    OR public.has_role(auth.uid(), 'admin')
  );

-- Funcionários podem registrar movimentações (saída de peças durante OS)
CREATE POLICY "me: insert"
  ON public.movimentacao_estoque FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_empresa_id());

-- Registros de movimentação são imutáveis: sem UPDATE ou DELETE via API

-- ============================================================
-- 4. TRIGGER: atualiza estoque_pecas.quantidade atomicamente
--    Roda BEFORE INSERT para preencher quantidade_anterior/nova
--    e fazer o UPDATE em estoque_pecas no mesmo statement.
-- ============================================================
CREATE OR REPLACE FUNCTION public.processar_movimentacao_estoque()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_qtd_atual NUMERIC(12,3);
BEGIN
  -- Lê quantidade atual com lock FOR UPDATE para prevenir race conditions
  SELECT quantidade INTO v_qtd_atual
  FROM public.estoque_pecas
  WHERE id = NEW.peca_id
  FOR UPDATE;

  IF v_qtd_atual IS NULL THEN
    RAISE EXCEPTION 'Peça % não encontrada', NEW.peca_id;
  END IF;

  NEW.quantidade_anterior := v_qtd_atual;

  CASE NEW.tipo
    WHEN 'entrada' THEN
      NEW.quantidade_nova := v_qtd_atual + NEW.quantidade;

    WHEN 'saida' THEN
      IF v_qtd_atual < NEW.quantidade THEN
        RAISE EXCEPTION
          'Estoque insuficiente. Disponível: %, Solicitado: %',
          v_qtd_atual, NEW.quantidade;
      END IF;
      NEW.quantidade_nova := v_qtd_atual - NEW.quantidade;

    WHEN 'ajuste' THEN
      -- Para ajuste, quantidade = novo valor absoluto do estoque
      NEW.quantidade_nova := NEW.quantidade;
  END CASE;

  -- Registra custo atual se não foi informado explicitamente
  IF NEW.custo_unitario IS NULL THEN
    SELECT valor_custo INTO NEW.custo_unitario
    FROM public.estoque_pecas WHERE id = NEW.peca_id;
  END IF;

  -- Aplica a movimentação no estoque
  UPDATE public.estoque_pecas
  SET quantidade = NEW.quantidade_nova, updated_at = now()
  WHERE id = NEW.peca_id;

  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.processar_movimentacao_estoque() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_processar_movimentacao ON public.movimentacao_estoque;
CREATE TRIGGER trg_processar_movimentacao
  BEFORE INSERT ON public.movimentacao_estoque
  FOR EACH ROW EXECUTE FUNCTION public.processar_movimentacao_estoque();

-- ============================================================
-- 5. FUNÇÃO: movimentar_estoque_os()
--    Utilitário chamado ao finalizar uma OS para debitar
--    automaticamente as peças usadas do estoque.
-- ============================================================
CREATE OR REPLACE FUNCTION public.movimentar_estoque_os(p_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_item    RECORD;
  v_peca_id UUID;
  v_count   INTEGER := 0;
BEGIN
  -- Itera sobre itens da OS que sejam do tipo peça
  FOR v_item IN
    SELECT soi.quantity, soi.description, soi.empresa_id, soi.category_id
    FROM public.service_order_items soi
    WHERE soi.order_id = p_order_id
      AND soi.item_type IN ('peca', 'outro')
  LOOP
    -- Tenta encontrar a peça no estoque pelo category_id ou descrição
    SELECT id INTO v_peca_id
    FROM public.estoque_pecas
    WHERE empresa_id = v_item.empresa_id
      AND ativo = true
      AND (
        (v_item.category_id IS NOT NULL AND id = v_item.category_id)
        OR lower(descricao) = lower(v_item.description)
      )
    LIMIT 1;

    IF v_peca_id IS NOT NULL THEN
      INSERT INTO public.movimentacao_estoque
        (empresa_id, peca_id, tipo, quantidade, order_id, motivo, created_by)
      VALUES
        (v_item.empresa_id, v_peca_id, 'saida', v_item.quantity,
         p_order_id, 'Baixa automática via OS', auth.uid());
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count; -- retorna nº de baixas realizadas
END $$;

REVOKE EXECUTE ON FUNCTION public.movimentar_estoque_os(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.movimentar_estoque_os(UUID) TO authenticated;

-- ============================================================
-- FIM DA MIGRATION 3/5
-- ============================================================
