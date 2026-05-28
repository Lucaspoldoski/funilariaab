
UPDATE storage.buckets SET public = false WHERE id = 'vehicle-photos';
DROP POLICY IF EXISTS "Photos public read" ON storage.objects;
CREATE POLICY "Photos auth read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'vehicle-photos');
