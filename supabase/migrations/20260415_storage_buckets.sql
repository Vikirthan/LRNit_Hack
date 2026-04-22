-- Create branding storage bucket for event logos
INSERT INTO storage.buckets (id, name, owner, public)
VALUES ('branding', 'branding', NULL, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to all files in branding bucket
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
CREATE POLICY "Public read access"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'branding');

-- Allow authenticated users to upload to branding bucket
DROP POLICY IF EXISTS "Authenticated upload to branding" ON storage.objects;
CREATE POLICY "Authenticated upload to branding"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'branding');

-- Allow authenticated users to update their own uploads in branding bucket
DROP POLICY IF EXISTS "Authenticated update in branding" ON storage.objects;
CREATE POLICY "Authenticated update in branding"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'branding');

-- Allow authenticated users to delete their own uploads in branding bucket
DROP POLICY IF EXISTS "Authenticated delete in branding" ON storage.objects;
CREATE POLICY "Authenticated delete in branding"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'branding');
