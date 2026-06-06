
-- clients: address breakdown + notes
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- vehicles: extra identification fields
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS version TEXT,
  ADD COLUMN IF NOT EXISTS fuel TEXT,
  ADD COLUMN IF NOT EXISTS renavam TEXT;

-- quotes: commercial terms
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms TEXT,
  ADD COLUMN IF NOT EXISTS warranty TEXT,
  ADD COLUMN IF NOT EXISTS delivery_forecast DATE;

-- vehicle_photos: optional link to the originating quote
ALTER TABLE public.vehicle_photos
  ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_photos_quote_id ON public.vehicle_photos(quote_id);

-- Refresh RLS so quote owner / manager / admin can also access photos via quote_id
DROP POLICY IF EXISTS "vehicle_photos_select" ON public.vehicle_photos;
DROP POLICY IF EXISTS "vehicle_photos_insert" ON public.vehicle_photos;
DROP POLICY IF EXISTS "vehicle_photos_update" ON public.vehicle_photos;
DROP POLICY IF EXISTS "vehicle_photos_delete" ON public.vehicle_photos;

CREATE POLICY "vehicle_photos_select" ON public.vehicle_photos
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = vehicle_photos.quote_id AND q.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_photos.vehicle_id AND v.created_by = auth.uid())
  );

CREATE POLICY "vehicle_photos_insert" ON public.vehicle_photos
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "vehicle_photos_update" ON public.vehicle_photos
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR uploaded_by = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR uploaded_by = auth.uid()
  );

CREATE POLICY "vehicle_photos_delete" ON public.vehicle_photos
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR uploaded_by = auth.uid()
  );
