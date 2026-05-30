
-- ============ CATEGORIES ============
CREATE TYPE public.category_type AS ENUM ('servico','peca','despesa','receita','forma_pagamento','prioridade','status_personalizado');

CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type public.category_type NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type, slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view categories" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert categories" ON public.categories FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "update categories" ON public.categories FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "delete categories" ON public.categories FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- Normalize slug automatically (lowercase, trimmed, spaces collapsed)
CREATE OR REPLACE FUNCTION public.normalize_category_slug()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.name := regexp_replace(btrim(NEW.name), '\s+', ' ', 'g');
  NEW.slug := lower(unaccent_safe(NEW.name));
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Simple unaccent fallback (no extension needed)
CREATE OR REPLACE FUNCTION public.unaccent_safe(t TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(t,
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
  )
$$;

DROP TRIGGER IF EXISTS trg_normalize_category ON public.categories;
CREATE TRIGGER trg_normalize_category BEFORE INSERT OR UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.normalize_category_slug();

-- Seed default service categories
INSERT INTO public.categories (type, name, slug, color, active) VALUES
  ('servico','Funilaria','funilaria','#f59e0b',true),
  ('servico','Pintura','pintura','#a855f7',true),
  ('servico','Polimento','polimento','#06b6d4',true),
  ('servico','Martelinho de Ouro','martelinho de ouro','#22c55e',true),
  ('servico','Troca de Peça','troca de peca','#3b82f6',true),
  ('servico','Higienização','higienizacao','#14b8a6',true),
  ('servico','Mecânica','mecanica','#ef4444',true),
  ('forma_pagamento','Dinheiro','dinheiro',NULL,true),
  ('forma_pagamento','PIX','pix',NULL,true),
  ('forma_pagamento','Cartão de Crédito','cartao de credito',NULL,true),
  ('forma_pagamento','Cartão de Débito','cartao de debito',NULL,true),
  ('forma_pagamento','Boleto','boleto',NULL,true),
  ('despesa','Peças','pecas',NULL,true),
  ('despesa','Tintas','tintas',NULL,true),
  ('despesa','Fornecedores','fornecedores',NULL,true),
  ('despesa','Salários','salarios',NULL,true),
  ('receita','Serviços','servicos',NULL,true),
  ('receita','Outras Receitas','outras receitas',NULL,true)
ON CONFLICT DO NOTHING;

-- ============ VEHICLE service_categories ============
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS service_categories UUID[] DEFAULT ARRAY[]::UUID[];

-- ============ PHOTOS: phases + extra fields ============
CREATE TYPE public.photo_phase AS ENUM ('antes','durante','depois','outro');

ALTER TABLE public.vehicle_photos
  ADD COLUMN IF NOT EXISTS phase public.photo_phase NOT NULL DEFAULT 'antes',
  ADD COLUMN IF NOT EXISTS damage_description TEXT,
  ADD COLUMN IF NOT EXISTS service_needed TEXT,
  ADD COLUMN IF NOT EXISTS parts_needed TEXT,
  ADD COLUMN IF NOT EXISTS technical_notes TEXT,
  ADD COLUMN IF NOT EXISTS order_id UUID,
  ADD COLUMN IF NOT EXISTS quote_id UUID;

-- ============ ITEM CATEGORY LINK ============
ALTER TABLE public.service_order_items ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;

-- ============ AUDIT LOGS ============
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  user_email TEXT,
  action TEXT NOT NULL,  -- INSERT | UPDATE | DELETE
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_table_record ON public.audit_logs(table_name, record_id);
CREATE INDEX idx_audit_created ON public.audit_logs(created_at DESC);

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins view audit" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  uemail TEXT;
BEGIN
  SELECT email INTO uemail FROM auth.users WHERE id = uid;
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs(user_id, user_email, action, table_name, record_id, old_data)
    VALUES (uid, uemail, TG_OP, TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs(user_id, user_email, action, table_name, record_id, old_data, new_data)
    VALUES (uid, uemail, TG_OP, TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    INSERT INTO public.audit_logs(user_id, user_email, action, table_name, record_id, new_data)
    VALUES (uid, uemail, TG_OP, TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  END IF;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['clients','vehicles','service_orders','quotes','financial_transactions']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_audit()', t, t);
  END LOOP;
END $$;
