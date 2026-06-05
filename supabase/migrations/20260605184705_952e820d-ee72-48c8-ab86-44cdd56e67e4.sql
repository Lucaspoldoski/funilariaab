
-- FINANCIAL TRANSACTIONS: restrict writes to admin/manager
DROP POLICY IF EXISTS "insert tx" ON public.financial_transactions;
DROP POLICY IF EXISTS "update tx" ON public.financial_transactions;

CREATE POLICY "insert tx (admin/manager)" ON public.financial_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "update tx (admin/manager)" ON public.financial_transactions
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

-- USER_ROLES: deny client-side mutations entirely
CREATE POLICY "Deny role insert (no privilege escalation)"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Deny role update (no privilege escalation)"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Deny role delete (no privilege escalation)"
  ON public.user_roles FOR DELETE TO authenticated
  USING (false);

-- VEHICLE_PHOTOS: restrict SELECT
DROP POLICY IF EXISTS "view photos" ON public.vehicle_photos;
CREATE POLICY "view photos (uploader, related creator or admin/manager)"
  ON public.vehicle_photos FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = vehicle_photos.order_id AND so.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = vehicle_photos.quote_id AND q.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_photos.vehicle_id AND v.created_by = auth.uid()
    )
  );

-- QUOTE_ITEMS: split ALL into scoped operations, restrict SELECT
DROP POLICY IF EXISTS "mutate quote items" ON public.quote_items;
DROP POLICY IF EXISTS "view quote items" ON public.quote_items;

CREATE POLICY "view quote items (quote creator or admin/manager)"
  ON public.quote_items FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_items.quote_id AND q.created_by = auth.uid()
    )
  );

CREATE POLICY "insert quote items (quote creator or admin/manager)"
  ON public.quote_items FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_items.quote_id AND q.created_by = auth.uid()
    )
  );

CREATE POLICY "update quote items (quote creator or admin/manager)"
  ON public.quote_items FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_items.quote_id AND q.created_by = auth.uid()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_items.quote_id AND q.created_by = auth.uid()
    )
  );

CREATE POLICY "delete quote items (quote creator or admin/manager)"
  ON public.quote_items FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_items.quote_id AND q.created_by = auth.uid()
    )
  );

-- STORAGE: restrict vehicle-photos read to uploader or admin/manager
DROP POLICY IF EXISTS "vehicle-photos read (owner or admin/manager)" ON storage.objects;
CREATE POLICY "vehicle-photos read (uploader or admin/manager)"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'vehicle-photos'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
      OR owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.vehicle_photos vp
        WHERE vp.path = storage.objects.name AND vp.uploaded_by = auth.uid()
      )
    )
  );
