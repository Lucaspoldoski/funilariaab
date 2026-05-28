
ALTER TABLE public.service_orders
  ADD CONSTRAINT service_orders_vehicle_fk FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE,
  ADD CONSTRAINT service_orders_client_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;

ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_client_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT,
  ADD CONSTRAINT quotes_vehicle_fk FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;

ALTER TABLE public.financial_transactions
  ADD CONSTRAINT tx_order_fk FOREIGN KEY (order_id) REFERENCES public.service_orders(id) ON DELETE SET NULL,
  ADD CONSTRAINT tx_client_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD CONSTRAINT tx_vehicle_fk FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;

ALTER TABLE public.vehicle_photos
  ADD CONSTRAINT vp_vehicle_fk FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;
