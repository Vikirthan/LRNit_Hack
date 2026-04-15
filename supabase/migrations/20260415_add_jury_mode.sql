-- Migration: Add jury_mode, is_active, and event_logo_url columns to settings table
-- Run this in Supabase SQL Editor if your settings table already exists

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS jury_mode text NOT NULL DEFAULT 'manual'
    CHECK (jury_mode IN ('manual', 'scan'));

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS event_logo_url text;
