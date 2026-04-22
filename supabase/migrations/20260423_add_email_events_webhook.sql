-- Migration: Store Brevo webhook events for email delivery insights

CREATE TABLE IF NOT EXISTS public.email_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_key TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'brevo',
    event_type TEXT NOT NULL,
    event_id TEXT,
    provider_message_id TEXT,
    recipient_email TEXT,
    subject TEXT,
    tag TEXT,
    event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_email_events_event_time ON public.email_events (event_time DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_event_type ON public.email_events (event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_recipient ON public.email_events (recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_events_provider_message_id ON public.email_events (provider_message_id);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read email events" ON public.email_events;
CREATE POLICY "Admins can read email events"
    ON public.email_events
    FOR SELECT
    USING (true);
