
-- ============================================================
-- MIGRATION 1/5: SaaS Multi-tenant — Âncora Empresas
-- ============================================================
-- Ordem de criação (dependências resolvidas):
--   plano_saas → empresas → empresa_usuarios → funções helper
--   → RLS empresas → RLS empresa_usuarios → registrar_empresa()
-- ============================================================

-- ============================================================
-- 1. ENUM: planos SaaS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.plano_saas AS ENUM ('basico', 'profissional', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. TABELA: empresas
--    Âncora de isolamento de dados entre tenants.
--    Cada oficina = uma linha aqui.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.empresas (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_fantasia  TEXT          NOT NULL,
  razao_social   TEXT,
  cnpj           TEXT          UNIQUE,
  telefone       TEXT,
  email          TEXT,
  plano          public.plano_saas NOT NULL DEFAULT 'basico',
  ativo          BOOLEAN       NOT NULL DEFAULT true,
  logo_url       TEXT,
  website        TEXT,
  endereco       TEXT,
  bairro         TEXT,
  cidade         TEXT,
  estado         CHAR(2),
  cep            TEXT,
  -- Limites por plano (validados na app layer)
  max_usuarios   SMALLINT      NOT NULL DEFAULT 5,
  max_veiculos   INTEGER       NOT NULL DEFAULT 500,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empresas_cnpj   ON public.empresas(cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_empresas_ativo   ON public.empresas(ativo) WHERE ativo = true;

CREATE TRIGGER empresas_set_updated_at
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.empresas TO authenticated;
GRANT ALL ON public.empresas TO service_role;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. TABELA: empresa_usuarios
--    Relacionamento N:M usuário ↔ empresa com role por empresa.
--    Um usuário pode (no futuro) pertencer a múltiplas empresas.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.empresa_usuarios (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID          NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id        UUID          NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  role           public.app_role NOT NULL DEFAULT 'employee',
  ativo          BOOLEAN       NOT NULL DEFAULT true,
  convidado_por  UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, user_id)
);

-- Índices parciais: somente registros ativos (reduz tamanho do índice em produção)
CREATE INDEX IF NOT EXISTS idx_eu_user_ativo
  ON public.empresa_usuarios(user_id) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_eu_empresa_ativo
  ON public.empresa_usuarios(empresa_id) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_eu_empresa_role
  ON public.empresa_usuarios(empresa_id, role) WHERE ativo = true;

GRANT SELECT, INSERT, UPDATE ON public.empresa_usuarios TO authenticated;
GRANT ALL ON public.empresa_usuarios TO service_role;
ALTER TABLE public.empresa_usuarios ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. FUNÇÕES HELPER — todas STABLE + SECURITY DEFINER
--    STABLE: PostgreSQL cacheia o resultado por statement → ~0 overhead
--    SECURITY DEFINER: leem empresa_usuarios sem restrição de RLS
--    (necessário pois empresa_usuarios também tem RLS)
-- ============================================================

-- Retorna o empresa_id do usuário logado
CREATE OR REPLACE FUNCTION public.get_empresa_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT empresa_id FROM public.empresa_usuarios
  WHERE user_id = auth.uid() AND ativo = true LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.get_empresa_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_empresa_id() TO authenticated;

-- Retorna o role do usuário logado na sua empresa
CREATE OR REPLACE FUNCTION public.get_empresa_role()
RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.empresa_usuarios
  WHERE user_id = auth.uid() AND ativo = true LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.get_empresa_role() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_empresa_role() TO authenticated;

-- Verifica se o usuário tem um role específico na empresa (admin ou manager etc.)
CREATE OR REPLACE FUNCTION public.empresa_has_role(_role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.empresa_usuarios
    WHERE user_id = auth.uid() AND role = _role AND ativo = true
  );
$$;
REVOKE EXECUTE ON FUNCTION public.empresa_has_role(public.app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.empresa_has_role(public.app_role) TO authenticated;

-- ============================================================
-- 5. RLS — empresas
--    - Usuário vê/edita apenas a SUA empresa
--    - Super-admin (user_roles.role = 'admin') vê todas
-- ============================================================
CREATE POLICY "emp: select própria ou super-admin"
  ON public.empresas FOR SELECT TO authenticated
  USING (
    id = public.get_empresa_id()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "emp: insert apenas super-admin"
  ON public.empresas FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "emp: update admin-empresa ou super-admin"
  ON public.empresas FOR UPDATE TO authenticated
  USING (
    (id = public.get_empresa_id()
      AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager')))
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    (id = public.get_empresa_id()
      AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager')))
    OR public.has_role(auth.uid(), 'admin')
  );

-- Exclusão de empresa: apenas via service_role (nunca via API de cliente)
-- Sem política de DELETE = bloqueia automaticamente para authenticated

-- ============================================================
-- 6. RLS — empresa_usuarios
-- ============================================================
CREATE POLICY "eu: select próprio ou admin-empresa ou super-admin"
  ON public.empresa_usuarios FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (empresa_id = public.get_empresa_id()
        AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager')))
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "eu: insert admin-empresa ou super-admin"
  ON public.empresa_usuarios FOR INSERT TO authenticated
  WITH CHECK (
    (empresa_id = public.get_empresa_id()
      AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager')))
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "eu: update admin-empresa ou super-admin"
  ON public.empresa_usuarios FOR UPDATE TO authenticated
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

-- Bloqueia DELETE via API (desativação via ativo=false é o caminho correto)
CREATE POLICY "eu: deny delete"
  ON public.empresa_usuarios FOR DELETE TO authenticated
  USING (false);

-- ============================================================
-- 7. FUNÇÃO DE ONBOARDING: registrar_empresa()
--    Cria empresa + vincula usuário logado como admin.
--    SECURITY DEFINER → bypassa RLS do INSERT em empresas.
--    Chamada pelo frontend durante o cadastro da oficina.
-- ============================================================
CREATE OR REPLACE FUNCTION public.registrar_empresa(
  p_nome_fantasia TEXT,
  p_razao_social  TEXT                DEFAULT NULL,
  p_cnpj          TEXT                DEFAULT NULL,
  p_email         TEXT                DEFAULT NULL,
  p_telefone      TEXT                DEFAULT NULL,
  p_plano         public.plano_saas   DEFAULT 'basico'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa_id UUID;
  v_user_id    UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  -- Impede que o mesmo usuário crie duas empresas (regra de negócio: 1 empresa por admin)
  IF EXISTS (SELECT 1 FROM public.empresa_usuarios WHERE user_id = v_user_id AND ativo = true) THEN
    RAISE EXCEPTION 'Usuário já pertence a uma empresa. Use o convite para adicionar membros.';
  END IF;

  INSERT INTO public.empresas (nome_fantasia, razao_social, cnpj, email, telefone, plano)
  VALUES (p_nome_fantasia, p_razao_social, p_cnpj, p_email, p_telefone, p_plano)
  RETURNING id INTO v_empresa_id;

  -- Vincular o criador como admin da nova empresa
  INSERT INTO public.empresa_usuarios (empresa_id, user_id, role)
  VALUES (v_empresa_id, v_user_id, 'admin');

  RETURN v_empresa_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.registrar_empresa(TEXT, TEXT, TEXT, TEXT, TEXT, public.plano_saas)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_empresa(TEXT, TEXT, TEXT, TEXT, TEXT, public.plano_saas)
  TO authenticated;

-- ============================================================
-- FIM DA MIGRATION 1/5
-- ============================================================
