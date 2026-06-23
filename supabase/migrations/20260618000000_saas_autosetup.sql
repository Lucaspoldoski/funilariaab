
-- ============================================================
-- MIGRATION: SaaS Auto-Setup — Empresa padrão + auto-fill
-- ============================================================
-- Problema resolvido:
--   1. Novos usuários ficam sem empresa → RLS bloqueia tudo.
--   2. Frontend não passa empresa_id nos inserts → RLS bloqueia.
--
-- Solução:
--   A) handle_new_user: cria empresa padrão + empresa_usuarios
--      automaticamente no signup, para que o usuário possa
--      usar o sistema imediatamente.
--   B) Triggers de auto-fill: preenchem empresa_id a partir de
--      get_empresa_id() quando o frontend não o envia.
-- ============================================================

-- ============================================================
-- PARTE A: Atualiza handle_new_user para criar empresa padrão
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id UUID;
  v_nome       TEXT;
BEGIN
  -- 1. Criar (ou atualizar) perfil
  INSERT INTO public.profiles(id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
    SET email      = EXCLUDED.email,
        full_name  = COALESCE(EXCLUDED.full_name, profiles.full_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
        updated_at = now();

  -- 2. Criar empresa padrão (se este usuário não tiver nenhuma)
  IF NOT EXISTS (
    SELECT 1 FROM public.empresa_usuarios WHERE user_id = NEW.id AND ativo = true
  ) THEN
    -- Nome da empresa: "Oficina de <nome>" ou "Oficina de <email-prefix>"
    v_nome := 'Oficina de ' ||
      COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
        split_part(NEW.email, '@', 1)
      );

    -- Criar empresa
    INSERT INTO public.empresas(nome_fantasia, email, plano, ativo, max_usuarios, max_veiculos)
    VALUES (v_nome, NEW.email, 'profissional', true, 10, 5000)
    RETURNING id INTO v_empresa_id;

    -- Associar usuário como admin
    INSERT INTO public.empresa_usuarios(empresa_id, user_id, role, ativo)
    VALUES (v_empresa_id, NEW.id, 'admin', true)
    ON CONFLICT (empresa_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Recriar trigger (idempotente)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- PARTE B: Auto-fill empresa_id nas tabelas principais
--   Equivalente ao que já existe para tabelas filhas.
--   Ordem: INSERT → get_empresa_id() preenche empresa_id.
-- ============================================================

-- ── clients ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fill_empresa_id_clients()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := public.get_empresa_id();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fill_empresa_clients ON public.clients;
CREATE TRIGGER trg_fill_empresa_clients
  BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.fill_empresa_id_clients();

-- ── vehicles ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fill_empresa_id_vehicles()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := public.get_empresa_id();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fill_empresa_vehicles ON public.vehicles;
CREATE TRIGGER trg_fill_empresa_vehicles
  BEFORE INSERT ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.fill_empresa_id_vehicles();

-- ── quotes ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fill_empresa_id_quotes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := public.get_empresa_id();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fill_empresa_quotes ON public.quotes;
CREATE TRIGGER trg_fill_empresa_quotes
  BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.fill_empresa_id_quotes();

-- ── service_orders ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fill_empresa_id_service_orders()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := public.get_empresa_id();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fill_empresa_so ON public.service_orders;
CREATE TRIGGER trg_fill_empresa_so
  BEFORE INSERT ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.fill_empresa_id_service_orders();

-- ── financial_transactions ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fill_empresa_id_ft()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := public.get_empresa_id();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fill_empresa_ft ON public.financial_transactions;
CREATE TRIGGER trg_fill_empresa_ft
  BEFORE INSERT ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fill_empresa_id_ft();

-- ── agendamentos ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fill_empresa_id_agendamentos()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := public.get_empresa_id();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fill_empresa_agend ON public.agendamentos;
CREATE TRIGGER trg_fill_empresa_agend
  BEFORE INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fill_empresa_id_agendamentos();

-- ── estoque_pecas ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fill_empresa_id_estoque()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := public.get_empresa_id();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fill_empresa_estoque ON public.estoque_pecas;
CREATE TRIGGER trg_fill_empresa_estoque
  BEFORE INSERT ON public.estoque_pecas
  FOR EACH ROW EXECUTE FUNCTION public.fill_empresa_id_estoque();

-- ============================================================
-- PARTE C: Retroativo — criar empresas para usuários já existentes
--          sem empresa associada (usuários criados antes desta migration)
-- ============================================================
DO $$
DECLARE
  u RECORD;
  v_empresa_id UUID;
BEGIN
  FOR u IN
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    WHERE NOT EXISTS (
      SELECT 1 FROM public.empresa_usuarios eu
      WHERE eu.user_id = au.id AND eu.ativo = true
    )
  LOOP
    INSERT INTO public.empresas(
      nome_fantasia, email, plano, ativo, max_usuarios, max_veiculos
    )
    VALUES (
      'Oficina de ' || COALESCE(
        NULLIF(u.raw_user_meta_data->>'full_name', ''),
        split_part(u.email, '@', 1)
      ),
      u.email, 'profissional', true, 10, 5000
    )
    RETURNING id INTO v_empresa_id;

    INSERT INTO public.empresa_usuarios(empresa_id, user_id, role, ativo)
    VALUES (v_empresa_id, u.id, 'admin', true)
    ON CONFLICT (empresa_id, user_id) DO NOTHING;
  END LOOP;
END $$;
