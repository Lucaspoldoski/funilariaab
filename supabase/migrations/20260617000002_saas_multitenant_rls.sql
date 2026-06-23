
-- ============================================================
-- MIGRATION 2/5: SaaS Multi-tenant — empresa_id em todas as tabelas
-- ============================================================
-- Para cada tabela:
--   A) ADD COLUMN empresa_id (nullable → FK para empresas)
--   B) Índices compostos (empresa_id, campo_frequente)
--   C) DROP de todas as policies existentes (via DO dinâmico)
--   D) CREATE das novas policies baseadas em empresa_id
-- ============================================================
-- NOTA: empresa_id é NULLABLE nesta migration para preservar
--       dados de desenvolvimento existentes. Em produção, após
--       backfill (UPDATE ... SET empresa_id = X), adicione:
--         ALTER TABLE public.<tabela>
--           ALTER COLUMN empresa_id SET NOT NULL;
-- ============================================================

-- ============================================================
-- PARTE A: ADD COLUMN empresa_id em todas as tabelas tenant
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE;

ALTER TABLE public.vehicle_status_history
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE;

ALTER TABLE public.vehicle_photos
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE;

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE;

-- Denormalizado: permite RLS sem JOIN no pai (performance crítica em multi-tenant)
ALTER TABLE public.service_order_items
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE;

-- Denormalizado: mesma razão de service_order_items
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE;

-- categories: NULL = global (todas as empresas veem), UUID = exclusiva da empresa
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE;

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE;

ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL;

-- ============================================================
-- PARTE B: Índices compostos para queries multi-tenant
--          Padrão: (empresa_id, campo_filtrado)
--          Permitem index-only scan na maioria das listagens
-- ============================================================

-- clients
CREATE INDEX IF NOT EXISTS idx_clients_emp_name
  ON public.clients(empresa_id, name) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_emp_phone
  ON public.clients(empresa_id, phone) WHERE empresa_id IS NOT NULL AND phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_emp_cpf
  ON public.clients(empresa_id, cpf_cnpj) WHERE empresa_id IS NOT NULL AND cpf_cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_emp_created
  ON public.clients(empresa_id, created_at DESC) WHERE empresa_id IS NOT NULL;

-- vehicles
CREATE INDEX IF NOT EXISTS idx_vehicles_emp_plate
  ON public.vehicles(empresa_id, plate) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_emp_status
  ON public.vehicles(empresa_id, status) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_emp_client
  ON public.vehicles(empresa_id, client_id) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_emp_entry
  ON public.vehicles(empresa_id, entry_date DESC) WHERE empresa_id IS NOT NULL;

-- vehicle_status_history
CREATE INDEX IF NOT EXISTS idx_vsh_emp_vehicle
  ON public.vehicle_status_history(empresa_id, vehicle_id) WHERE empresa_id IS NOT NULL;

-- vehicle_photos
CREATE INDEX IF NOT EXISTS idx_vp_emp_vehicle
  ON public.vehicle_photos(empresa_id, vehicle_id) WHERE empresa_id IS NOT NULL;

-- service_orders
CREATE INDEX IF NOT EXISTS idx_so_emp_status
  ON public.service_orders(empresa_id, status) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_so_emp_client
  ON public.service_orders(empresa_id, client_id) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_so_emp_num
  ON public.service_orders(empresa_id, number DESC) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_so_emp_created
  ON public.service_orders(empresa_id, created_at DESC) WHERE empresa_id IS NOT NULL;

-- service_order_items
CREATE INDEX IF NOT EXISTS idx_soi_emp_order
  ON public.service_order_items(empresa_id, order_id) WHERE empresa_id IS NOT NULL;

-- quotes
CREATE INDEX IF NOT EXISTS idx_quotes_emp_status
  ON public.quotes(empresa_id, status) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_emp_client
  ON public.quotes(empresa_id, client_id) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_emp_created
  ON public.quotes(empresa_id, created_at DESC) WHERE empresa_id IS NOT NULL;

-- quote_items
CREATE INDEX IF NOT EXISTS idx_qi_emp_quote
  ON public.quote_items(empresa_id, quote_id) WHERE empresa_id IS NOT NULL;

-- financial_transactions
CREATE INDEX IF NOT EXISTS idx_ft_emp_type_status
  ON public.financial_transactions(empresa_id, type, status) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ft_emp_date
  ON public.financial_transactions(empresa_id, data_movimentacao DESC NULLS LAST) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ft_emp_due
  ON public.financial_transactions(empresa_id, due_date) WHERE empresa_id IS NOT NULL AND status = 'pendente';

-- categories
CREATE INDEX IF NOT EXISTS idx_cat_emp_type
  ON public.categories(empresa_id, type) WHERE empresa_id IS NOT NULL;

-- agendamentos
CREATE INDEX IF NOT EXISTS idx_agend_emp_data
  ON public.agendamentos(empresa_id, data_agendada) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agend_emp_status_data
  ON public.agendamentos(empresa_id, status, data_agendada)
  WHERE empresa_id IS NOT NULL AND status IN ('agendado', 'confirmado');

-- servicos
CREATE INDEX IF NOT EXISTS idx_servicos_emp_status
  ON public.servicos(empresa_id, status) WHERE empresa_id IS NOT NULL;

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_emp_created
  ON public.audit_logs(empresa_id, created_at DESC) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_emp_table
  ON public.audit_logs(empresa_id, table_name) WHERE empresa_id IS NOT NULL;

-- ============================================================
-- PARTE C: Triggers de auto-preenchimento de empresa_id
--          Filhos herdam empresa_id do pai no INSERT.
--          Eliminam a necessidade de o frontend enviar empresa_id
--          em cada item — reduz surface de ataque.
-- ============================================================

-- service_order_items ← service_orders
CREATE OR REPLACE FUNCTION public.fill_soi_empresa_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    SELECT empresa_id INTO NEW.empresa_id
    FROM public.service_orders WHERE id = NEW.order_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fill_soi_empresa_id() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fill_soi_empresa ON public.service_order_items;
CREATE TRIGGER trg_fill_soi_empresa
  BEFORE INSERT ON public.service_order_items
  FOR EACH ROW EXECUTE FUNCTION public.fill_soi_empresa_id();

-- quote_items ← quotes
CREATE OR REPLACE FUNCTION public.fill_qi_empresa_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    SELECT empresa_id INTO NEW.empresa_id
    FROM public.quotes WHERE id = NEW.quote_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fill_qi_empresa_id() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fill_qi_empresa ON public.quote_items;
CREATE TRIGGER trg_fill_qi_empresa
  BEFORE INSERT ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public.fill_qi_empresa_id();

-- servicos ← service_orders
CREATE OR REPLACE FUNCTION public.fill_servico_empresa_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    SELECT empresa_id INTO NEW.empresa_id
    FROM public.service_orders WHERE id = NEW.order_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fill_servico_empresa_id() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fill_servico_empresa ON public.servicos;
CREATE TRIGGER trg_fill_servico_empresa
  BEFORE INSERT ON public.servicos
  FOR EACH ROW EXECUTE FUNCTION public.fill_servico_empresa_id();

-- vehicle_photos ← vehicles
CREATE OR REPLACE FUNCTION public.fill_photo_empresa_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    SELECT empresa_id INTO NEW.empresa_id
    FROM public.vehicles WHERE id = NEW.vehicle_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fill_photo_empresa_id() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fill_photo_empresa ON public.vehicle_photos;
CREATE TRIGGER trg_fill_photo_empresa
  BEFORE INSERT ON public.vehicle_photos
  FOR EACH ROW EXECUTE FUNCTION public.fill_photo_empresa_id();

-- vehicle_status_history: atualiza a função existente para incluir empresa_id
CREATE OR REPLACE FUNCTION public.log_vehicle_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.vehicle_status_history(vehicle_id, empresa_id, old_status, new_status, changed_by)
    VALUES (NEW.id, NEW.empresa_id, NULL, NEW.status, NEW.created_by);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.vehicle_status_history(vehicle_id, empresa_id, old_status, new_status, changed_by)
    VALUES (NEW.id, NEW.empresa_id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END $$;

-- ============================================================
-- PARTE D: Rebuild completo de RLS
--          Padrão uniforme para todas as tabelas tenant:
--            SELECT: empresa_id = get_empresa_id() | super-admin
--            INSERT: empresa_id = get_empresa_id() (enforced)
--            UPDATE: empresa_id = get_empresa_id() | super-admin
--            DELETE: empresa_id = get_empresa_id() + admin/manager
--          Tabelas financeiras: apenas admin/manager da empresa
-- ============================================================

-- Helper interno: dropa todas as policies de uma tabela
-- (Evita listar nomes hardcoded que podem ter variado entre ambientes)
CREATE OR REPLACE FUNCTION public._drop_all_policies(p_table TEXT)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = p_table
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, p_table);
  END LOOP;
END $$;

-- ---- clients ----
SELECT public._drop_all_policies('clients');

CREATE POLICY "clients: select"
  ON public.clients FOR SELECT TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "clients: insert"
  ON public.clients FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_empresa_id());

CREATE POLICY "clients: update"
  ON public.clients FOR UPDATE TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "clients: delete (admin/manager)"
  ON public.clients FOR DELETE TO authenticated
  USING (
    empresa_id = public.get_empresa_id()
    AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager'))
  );

-- ---- vehicles ----
SELECT public._drop_all_policies('vehicles');

CREATE POLICY "vehicles: select"
  ON public.vehicles FOR SELECT TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "vehicles: insert"
  ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_empresa_id());

CREATE POLICY "vehicles: update"
  ON public.vehicles FOR UPDATE TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "vehicles: delete (admin/manager)"
  ON public.vehicles FOR DELETE TO authenticated
  USING (
    empresa_id = public.get_empresa_id()
    AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager'))
  );

-- ---- vehicle_status_history ----
SELECT public._drop_all_policies('vehicle_status_history');

CREATE POLICY "vsh: select"
  ON public.vehicle_status_history FOR SELECT TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "vsh: insert"
  ON public.vehicle_status_history FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

-- ---- vehicle_photos ----
SELECT public._drop_all_policies('vehicle_photos');

CREATE POLICY "vp: select"
  ON public.vehicle_photos FOR SELECT TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "vp: insert"
  ON public.vehicle_photos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_empresa_id());

CREATE POLICY "vp: update (uploader ou admin/manager)"
  ON public.vehicle_photos FOR UPDATE TO authenticated
  USING (
    empresa_id = public.get_empresa_id()
    AND (uploaded_by = auth.uid() OR public.empresa_has_role('admin') OR public.empresa_has_role('manager'))
  )
  WITH CHECK (empresa_id = public.get_empresa_id());

CREATE POLICY "vp: delete (uploader ou admin/manager)"
  ON public.vehicle_photos FOR DELETE TO authenticated
  USING (
    empresa_id = public.get_empresa_id()
    AND (uploaded_by = auth.uid() OR public.empresa_has_role('admin') OR public.empresa_has_role('manager'))
  );

-- ---- service_orders ----
SELECT public._drop_all_policies('service_orders');

CREATE POLICY "so: select"
  ON public.service_orders FOR SELECT TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "so: insert"
  ON public.service_orders FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_empresa_id());

CREATE POLICY "so: update"
  ON public.service_orders FOR UPDATE TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "so: delete (admin/manager)"
  ON public.service_orders FOR DELETE TO authenticated
  USING (
    empresa_id = public.get_empresa_id()
    AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager'))
  );

-- ---- service_order_items ----
SELECT public._drop_all_policies('service_order_items');

CREATE POLICY "soi: select"
  ON public.service_order_items FOR SELECT TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

-- empresa_id pode ser NULL enquanto o trigger ainda não rodou (BEFORE INSERT)
CREATE POLICY "soi: insert"
  ON public.service_order_items FOR INSERT TO authenticated
  WITH CHECK (empresa_id IS NULL OR empresa_id = public.get_empresa_id());

CREATE POLICY "soi: update"
  ON public.service_order_items FOR UPDATE TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "soi: delete"
  ON public.service_order_items FOR DELETE TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

-- ---- quotes ----
SELECT public._drop_all_policies('quotes');

CREATE POLICY "quotes: select"
  ON public.quotes FOR SELECT TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "quotes: insert"
  ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_empresa_id());

CREATE POLICY "quotes: update"
  ON public.quotes FOR UPDATE TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "quotes: delete (admin/manager)"
  ON public.quotes FOR DELETE TO authenticated
  USING (
    empresa_id = public.get_empresa_id()
    AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager'))
  );

-- ---- quote_items ----
SELECT public._drop_all_policies('quote_items');

CREATE POLICY "qi: select"
  ON public.quote_items FOR SELECT TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "qi: insert"
  ON public.quote_items FOR INSERT TO authenticated
  WITH CHECK (empresa_id IS NULL OR empresa_id = public.get_empresa_id());

CREATE POLICY "qi: update"
  ON public.quote_items FOR UPDATE TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "qi: delete"
  ON public.quote_items FOR DELETE TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

-- ---- financial_transactions ----
-- Mais restritivo: somente admin/manager da empresa (dados financeiros sensíveis)
SELECT public._drop_all_policies('financial_transactions');

CREATE POLICY "ft: select (admin/manager)"
  ON public.financial_transactions FOR SELECT TO authenticated
  USING (
    (empresa_id = public.get_empresa_id()
      AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager')))
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "ft: insert (admin/manager)"
  ON public.financial_transactions FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = public.get_empresa_id()
    AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager'))
  );

CREATE POLICY "ft: update (admin/manager)"
  ON public.financial_transactions FOR UPDATE TO authenticated
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

CREATE POLICY "ft: delete (admin/manager)"
  ON public.financial_transactions FOR DELETE TO authenticated
  USING (
    empresa_id = public.get_empresa_id()
    AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager'))
  );

-- ---- categories ----
-- NULL = global (todas as empresas veem); UUID = empresa-específica
SELECT public._drop_all_policies('categories');

CREATE POLICY "cat: select (global + própria empresa)"
  ON public.categories FOR SELECT TO authenticated
  USING (
    empresa_id IS NULL
    OR empresa_id = public.get_empresa_id()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "cat: insert (admin/manager)"
  ON public.categories FOR INSERT TO authenticated
  WITH CHECK (
    (empresa_id = public.get_empresa_id()
      AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager')))
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "cat: update"
  ON public.categories FOR UPDATE TO authenticated
  USING (
    (empresa_id IS NULL AND public.has_role(auth.uid(), 'admin'))
    OR (empresa_id = public.get_empresa_id()
        AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager')))
  )
  WITH CHECK (
    (empresa_id IS NULL AND public.has_role(auth.uid(), 'admin'))
    OR (empresa_id = public.get_empresa_id()
        AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager')))
  );

CREATE POLICY "cat: delete (empresa-específica, admin/manager)"
  ON public.categories FOR DELETE TO authenticated
  USING (
    empresa_id = public.get_empresa_id()
    AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager'))
  );

-- ---- agendamentos ----
SELECT public._drop_all_policies('agendamentos');

CREATE POLICY "agend: select"
  ON public.agendamentos FOR SELECT TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "agend: insert"
  ON public.agendamentos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_empresa_id());

CREATE POLICY "agend: update"
  ON public.agendamentos FOR UPDATE TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "agend: delete (admin/manager)"
  ON public.agendamentos FOR DELETE TO authenticated
  USING (
    empresa_id = public.get_empresa_id()
    AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager'))
  );

-- ---- servicos ----
SELECT public._drop_all_policies('servicos');

CREATE POLICY "serv: select"
  ON public.servicos FOR SELECT TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "serv: insert"
  ON public.servicos FOR INSERT TO authenticated
  WITH CHECK (empresa_id IS NULL OR empresa_id = public.get_empresa_id());

CREATE POLICY "serv: update"
  ON public.servicos FOR UPDATE TO authenticated
  USING (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (empresa_id = public.get_empresa_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "serv: delete (admin/manager)"
  ON public.servicos FOR DELETE TO authenticated
  USING (
    empresa_id = public.get_empresa_id()
    AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager'))
  );

-- ---- audit_logs ----
SELECT public._drop_all_policies('audit_logs');

CREATE POLICY "audit: select (admin/manager da empresa ou super-admin)"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    (empresa_id = public.get_empresa_id()
      AND (public.empresa_has_role('admin') OR public.empresa_has_role('manager')))
    OR public.has_role(auth.uid(), 'admin')
  );

-- Apenas service_role e triggers inserem em audit_logs
-- Sem política de INSERT para authenticated = bloqueia writes diretos da API

-- ============================================================
-- CLEANUP: Remove função helper temporária
-- ============================================================
DROP FUNCTION IF EXISTS public._drop_all_policies(TEXT);

-- ============================================================
-- FIM DA MIGRATION 2/5
-- ============================================================
