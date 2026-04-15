-- Migration: Add event_logo_url to scheduled_emails
ALTER TABLE public.scheduled_emails ADD COLUMN IF NOT EXISTS event_logo_url TEXT;
