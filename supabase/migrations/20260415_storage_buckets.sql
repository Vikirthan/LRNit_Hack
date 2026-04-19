-- ============================================================
-- 1. Create 'branding' bucket
-- ============================================================
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

-- ============================================================
-- 2. Storage Policies for 'branding' bucket
-- ============================================================

-- Allow anyone to view public logos
drop policy if exists "Public Access" on storage.objects;
create policy "Public Access" on storage.objects
for select using ( bucket_id = 'branding' );

-- Allow authenticated users (Admins) to upload logos
drop policy if exists "Authenticated Upload" on storage.objects;
create policy "Authenticated Upload" on storage.objects
for insert with check ( bucket_id = 'branding' );

-- Allow authenticated users (Admins) to update/delete logos
drop policy if exists "Authenticated Delete" on storage.objects;
create policy "Authenticated Delete" on storage.objects
for delete using ( bucket_id = 'branding' );

drop policy if exists "Authenticated Update" on storage.objects;
create policy "Authenticated Update" on storage.objects
for update using ( bucket_id = 'branding' );
