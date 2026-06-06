
-- categories: restrict insert/update to admin/manager
DROP POLICY IF EXISTS "categories_insert" ON public.categories;
DROP POLICY IF EXISTS "categories_update" ON public.categories;
DROP POLICY IF EXISTS "Categories insert" ON public.categories;
DROP POLICY IF EXISTS "Categories update" ON public.categories;

CREATE POLICY "categories_insert_admin_manager" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "categories_update_admin_manager" ON public.categories
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

-- clients: restrict update to owner/admin/manager
DROP POLICY IF EXISTS "clients_update" ON public.clients;
DROP POLICY IF EXISTS "Clients update" ON public.clients;

CREATE POLICY "clients_update_owner_admin_manager" ON public.clients
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR created_by = auth.uid());

-- vehicles: restrict update to owner/admin/manager
DROP POLICY IF EXISTS "vehicles_update" ON public.vehicles;
DROP POLICY IF EXISTS "Vehicles update" ON public.vehicles;

CREATE POLICY "vehicles_update_owner_admin_manager" ON public.vehicles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR created_by = auth.uid());

-- quotes: restrict update to owner/admin/manager
DROP POLICY IF EXISTS "quotes_update" ON public.quotes;
DROP POLICY IF EXISTS "Quotes update" ON public.quotes;

CREATE POLICY "quotes_update_owner_admin_manager" ON public.quotes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR created_by = auth.uid());

-- service_orders: restrict update to owner/admin/manager
DROP POLICY IF EXISTS "service_orders_update" ON public.service_orders;
DROP POLICY IF EXISTS "Service orders update" ON public.service_orders;

CREATE POLICY "service_orders_update_owner_admin_manager" ON public.service_orders
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR created_by = auth.uid());

-- vehicle_status_history: restrict manual inserts to admin/manager (DB trigger uses SECURITY DEFINER context via log function, which runs as table owner and bypasses RLS)
DROP POLICY IF EXISTS "vehicle_status_history_insert" ON public.vehicle_status_history;
DROP POLICY IF EXISTS "Vehicle status history insert" ON public.vehicle_status_history;

CREATE POLICY "vehicle_status_history_insert_admin_manager" ON public.vehicle_status_history
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));
