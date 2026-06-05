
-- CLIENTS: restrict SELECT
DROP POLICY IF EXISTS "Authenticated can view clients" ON public.clients;
CREATE POLICY "View clients (admin/manager or creator)" ON public.clients
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR created_by = auth.uid()
  );

-- FINANCIAL TRANSACTIONS: restrict SELECT
DROP POLICY IF EXISTS "view tx" ON public.financial_transactions;
CREATE POLICY "view tx" ON public.financial_transactions
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

-- PROFILES: restrict SELECT to self or admin/manager
DROP POLICY IF EXISTS "Profiles are viewable by authenticated" ON public.profiles;
CREATE POLICY "Users view own profile or admin/manager" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

-- SERVICE_ORDER_ITEMS: split ALL into scoped operations
DROP POLICY IF EXISTS "mutate os items" ON public.service_order_items;

CREATE POLICY "insert os items (order creator or admin/manager)"
  ON public.service_order_items FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_items.order_id AND so.created_by = auth.uid()
    )
  );

CREATE POLICY "update os items (order creator or admin/manager)"
  ON public.service_order_items FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_items.order_id AND so.created_by = auth.uid()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_items.order_id AND so.created_by = auth.uid()
    )
  );

CREATE POLICY "delete os items (order creator or admin/manager)"
  ON public.service_order_items FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_items.order_id AND so.created_by = auth.uid()
    )
  );

-- VEHICLE_PHOTOS: scope update/delete to uploader or admin/manager
DROP POLICY IF EXISTS "delete photos" ON public.vehicle_photos;
DROP POLICY IF EXISTS "update photos" ON public.vehicle_photos;

CREATE POLICY "delete photos (uploader or admin/manager)"
  ON public.vehicle_photos FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "update photos (uploader or admin/manager)"
  ON public.vehicle_photos FOR UPDATE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  )
  WITH CHECK (
    uploaded_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

-- STORAGE: vehicle-photos bucket ownership checks
DROP POLICY IF EXISTS "Photos auth read" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Auth update photos" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete photos" ON storage.objects;

-- Read: authenticated users can read files referenced by a vehicle_photos row they can see via RLS,
-- OR admin/manager can read all in bucket.
CREATE POLICY "vehicle-photos read (owner or admin/manager)"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'vehicle-photos'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.vehicle_photos vp
        WHERE vp.path = storage.objects.name
      )
    )
  );

-- Upload: only authenticated, and file owner must be set to current user
CREATE POLICY "vehicle-photos upload (self)"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vehicle-photos'
    AND owner = auth.uid()
  );

CREATE POLICY "vehicle-photos update (owner or admin/manager)"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'vehicle-photos'
    AND (
      owner = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
    )
  );

CREATE POLICY "vehicle-photos delete (owner or admin/manager)"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'vehicle-photos'
    AND (
      owner = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
    )
  );
