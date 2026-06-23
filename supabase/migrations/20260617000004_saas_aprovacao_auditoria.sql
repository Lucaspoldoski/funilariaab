
-- ============================================================
-- MIGRATION 4/5: SaaS — Aprovação de Orçamentos + Auditoria
-- ============================================================
-- Parte A: orcamento_aprovacao — rastreabilidade jurídica
-- Parte B: log_audit() reescrito para capturar empresa_id
-- Parte C: índices adicionais no audit_logs
-- ============================================================

-- ============================================================
-- PARTE A: TABELA orcamento_aprovacao
--    Cada linha = decisão formal sobre um orçamento.
--    Imutável após inserção (sem UPDATE/DELETE via API).
--    Trigger sincroniza quotes.status automaticamente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.orcamento_aprovacao (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  orcamento_id     UUID        NOT NULL REFERENCES public.quotes(id)   ON DELETE CASCADE,
  decisao          TEXT        NOT NULL CHECK (decisao IN ('aprovado', 'recusado')),
  aprovado_por     UUID        NOT NULL REFERENCES auth.users(id)      ON DELETE RESTRICT,
  data_aprovacao   TIMESTAMPTZ NOT NULL DEFAULT now(),
  observacoes      TEXT,
  assinatura_data  TEXT,   -- base64 da assinatura digital do cliente
  ip_origem        INET,   -- IP do dispositivo que realizou a aprovação
  user_agent       TEXT,   -- navegador/dispositivo do aprovador
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  -- Sem updated_at: registros de aprovação são imutáveis
);

-- Índice principal: buscar aprovações por orçamento
CREATE INDEX IF NOT EXISTS idx_oa_orcamento
  ON public.orcamento_aprovacao(orcamento_id);
-- Índice para consultar aprovações por empresa e data
CREATE INDEX IF NOT EXISTS idx_oa_empresa_data
  ON public.orcamento_aprovacao(empresa_id, data_aprovacao DESC);
-- Índice para auditoria por aprovador
CREATE INDEX IF NOT EXISTS idx_oa_aprovador
  ON public.orcamento_aprovacao(aprovado_por);

GRANT SELECT, INSERT ON public.orcamento_aprovacao TO authenticated;
GRANT ALL ON public.orcamento_aprovacao TO service_role;
ALTER TABLE public.orcamento_aprovacao ENABLE ROW LEVEL SECURITY;

-- Todos da empresa veem; apenas admin/manager podem aprovar (INSERT)
CREATE POLICY "oa: select"
  ON public.orcamento_aprovacao FOR SELECT TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "oa: insert (admin/manager)"
  ON public.orcamento_aprovacao FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = public.get_empresa_id()
    AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager'))
  );

-- Sem UPDATE/DELETE: aprovações são registros legais imutáveis

-- ============================================================
-- TRIGGER: ao inserir aprovação, atualiza quotes.status
-- ============================================================
CREATE OR REPLACE FUNCTION public.processar_aprovacao_orcamento()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  UPDATE public.quotes
  SET
    status     = CASE NEW.decisao
                   WHEN 'aprovado' THEN 'aprovado'::public.quote_status
                   WHEN 'recusado' THEN 'recusado'::public.quote_status
                 END,
    updated_at = now()
  WHERE id = NEW.orcamento_id;

  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.processar_aprovacao_orcamento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_processar_aprovacao ON public.orcamento_aprovacao;
CREATE TRIGGER trg_processar_aprovacao
  AFTER INSERT ON public.orcamento_aprovacao
  FOR EACH ROW EXECUTE FUNCTION public.processar_aprovacao_orcamento();

-- ============================================================
-- PARTE B: AUDIT LOGS APRIMORADO
--    Campos novos já foram adicionados na migration 2 (empresa_id).
--    Aqui reescrevemos log_audit() para capturar empresa_id
--    e adicionamos campos de contexto (ip, user_agent, sessão).
-- ============================================================

-- Adiciona campos de contexto à tabela existente
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS ip_origem  INET,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS session_id TEXT;  -- Supabase auth session_id (JWT jti)

-- Índice para investigação de sessões suspeitas
CREATE INDEX IF NOT EXISTS idx_audit_session
  ON public.audit_logs(session_id) WHERE session_id IS NOT NULL;

-- ============================================================
-- Reescreve log_audit() com:
--   1. Captura de empresa_id do registro (quando disponível)
--   2. Fallback para get_empresa_id() do usuário logado
--   3. Lógica robusta para DELETE/UPDATE/INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid      UUID   := auth.uid();
  v_email    TEXT;
  v_eid      UUID;
  v_session  TEXT;
BEGIN
  -- Busca email e sessão do usuário logado
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  -- Tenta extrair empresa_id do próprio registro; fallback para empresa do usuário
  IF TG_OP = 'DELETE' THEN
    v_eid := COALESCE(
      (to_jsonb(OLD) ->> 'empresa_id')::uuid,
      public.get_empresa_id()
    );
    INSERT INTO public.audit_logs(
      user_id, user_email, empresa_id,
      action, table_name, record_id,
      old_data
    ) VALUES (
      v_uid, v_email, v_eid,
      TG_OP, TG_TABLE_NAME, OLD.id,
      to_jsonb(OLD)
    );
    RETURN OLD;
  ELSE
    v_eid := COALESCE(
      (to_jsonb(NEW) ->> 'empresa_id')::uuid,
      public.get_empresa_id()
    );
    IF TG_OP = 'UPDATE' THEN
      INSERT INTO public.audit_logs(
        user_id, user_email, empresa_id,
        action, table_name, record_id,
        old_data, new_data
      ) VALUES (
        v_uid, v_email, v_eid,
        TG_OP, TG_TABLE_NAME, NEW.id,
        to_jsonb(OLD), to_jsonb(NEW)
      );
      RETURN NEW;
    ELSE -- INSERT
      INSERT INTO public.audit_logs(
        user_id, user_email, empresa_id,
        action, table_name, record_id,
        new_data
      ) VALUES (
        v_uid, v_email, v_eid,
        TG_OP, TG_TABLE_NAME, NEW.id,
        to_jsonb(NEW)
      );
      RETURN NEW;
    END IF;
  END IF;
END $$;

-- Mantém trigger de auditoria nas tabelas principais
-- (recria para incluir as novas tabelas desta migration)
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'clients', 'vehicles', 'service_orders', 'quotes',
    'financial_transactions', 'agendamentos', 'servicos',
    'estoque_pecas', 'orcamento_aprovacao'
  ]) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I',
      t, t
    );
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%I
         AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.log_audit()',
      t, t
    );
  END LOOP;
END $$;

-- ============================================================
-- PARTE C: FUNÇÃO DE CONSULTA DE AUDITORIA
--    Facilita investigação por período, tabela ou usuário.
-- ============================================================
CREATE OR REPLACE FUNCTION public.consultar_auditoria(
  p_table_name TEXT        DEFAULT NULL,
  p_record_id  UUID        DEFAULT NULL,
  p_desde      TIMESTAMPTZ DEFAULT (now() - INTERVAL '30 days'),
  p_ate        TIMESTAMPTZ DEFAULT now(),
  p_limit      INTEGER     DEFAULT 100
)
RETURNS SETOF public.audit_logs
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT * FROM public.audit_logs
  WHERE
    empresa_id = public.get_empresa_id()
    AND created_at BETWEEN p_desde AND p_ate
    AND (p_table_name IS NULL OR table_name = p_table_name)
    AND (p_record_id  IS NULL OR record_id  = p_record_id)
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION public.consultar_auditoria(TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.consultar_auditoria(TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER)
  TO authenticated;

-- ============================================================
-- FIM DA MIGRATION 4/5
-- ============================================================
