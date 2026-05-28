
-- Enums
CREATE TYPE public.order_status AS ENUM ('rascunho','aprovada','em_execucao','concluida','cancelada');
CREATE TYPE public.quote_status AS ENUM ('pendente','aprovado','recusado','expirado');
CREATE TYPE public.transaction_type AS ENUM ('receita','despesa');
CREATE TYPE public.transaction_status AS ENUM ('pendente','pago','atrasado','cancelado');
CREATE TYPE public.item_type AS ENUM ('servico','peca');

-- Sequence for OS / Quote numbers
CREATE SEQUENCE public.service_order_number_seq START 1000;
CREATE SEQUENCE public.quote_number_seq START 1000;

-- service_orders
CREATE TABLE public.service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INTEGER NOT NULL DEFAULT nextval('public.service_order_number_seq'),
  vehicle_id UUID NOT NULL,
  client_id UUID NOT NULL,
  status public.order_status NOT NULL DEFAULT 'rascunho',
  description TEXT,
  labor_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  parts_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  signature_data TEXT,
  signed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_orders TO authenticated;
GRANT ALL ON public.service_orders TO service_role;
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view os" ON public.service_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert os" ON public.service_orders FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "update os" ON public.service_orders FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "delete os" ON public.service_orders FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE TRIGGER trg_os_updated BEFORE UPDATE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- service_order_items
CREATE TABLE public.service_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  item_type public.item_type NOT NULL DEFAULT 'servico',
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_order_items TO authenticated;
GRANT ALL ON public.service_order_items TO service_role;
ALTER TABLE public.service_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view os items" ON public.service_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "mutate os items" ON public.service_order_items FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- quotes
CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INTEGER NOT NULL DEFAULT nextval('public.quote_number_seq'),
  vehicle_id UUID,
  client_id UUID NOT NULL,
  status public.quote_status NOT NULL DEFAULT 'pendente',
  description TEXT,
  valid_until DATE,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view quotes" ON public.quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert quotes" ON public.quotes FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "update quotes" ON public.quotes FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "delete quotes" ON public.quotes FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE TRIGGER trg_quotes_updated BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- quote_items
CREATE TABLE public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  item_type public.item_type NOT NULL DEFAULT 'servico',
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_items TO authenticated;
GRANT ALL ON public.quote_items TO service_role;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view quote items" ON public.quote_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "mutate quote items" ON public.quote_items FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- financial_transactions
CREATE TABLE public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.transaction_type NOT NULL,
  status public.transaction_status NOT NULL DEFAULT 'pendente',
  category TEXT,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  due_date DATE,
  paid_date DATE,
  order_id UUID,
  client_id UUID,
  vehicle_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_transactions TO authenticated;
GRANT ALL ON public.financial_transactions TO service_role;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view tx" ON public.financial_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert tx" ON public.financial_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "update tx" ON public.financial_transactions FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "delete tx" ON public.financial_transactions FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE TRIGGER trg_tx_updated BEFORE UPDATE ON public.financial_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- vehicle_photos
CREATE TABLE public.vehicle_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  path TEXT NOT NULL,
  caption TEXT,
  marks JSONB NOT NULL DEFAULT '[]'::jsonb,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_photos TO authenticated;
GRANT ALL ON public.vehicle_photos TO service_role;
ALTER TABLE public.vehicle_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view photos" ON public.vehicle_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert photos" ON public.vehicle_photos FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "update photos" ON public.vehicle_photos FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "delete photos" ON public.vehicle_photos FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('vehicle-photos','vehicle-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Photos public read" ON storage.objects FOR SELECT USING (bucket_id = 'vehicle-photos');
CREATE POLICY "Auth upload photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'vehicle-photos');
CREATE POLICY "Auth update photos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'vehicle-photos');
CREATE POLICY "Auth delete photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'vehicle-photos');
