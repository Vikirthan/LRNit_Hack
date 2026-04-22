-- Migration: Mailing history and recipient insights

CREATE TABLE IF NOT EXISTS public.mailing_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    subject TEXT NOT NULL,
    content TEXT,
    signature TEXT,
    from_name TEXT,
    from_email TEXT,
    scheduled_at TIMESTAMPTZ,
    send_mode TEXT NOT NULL DEFAULT 'send_now' CHECK (send_mode IN ('send_now', 'scheduled')),
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'scheduled', 'sent', 'partial', 'failed', 'cancelled')),
    recipient_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.mailing_batch_recipients (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    batch_id UUID NOT NULL REFERENCES public.mailing_batches(id) ON DELETE CASCADE,
    recipient_name TEXT,
    recipient_email TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mailing_batch_recipients_unique
    ON public.mailing_batch_recipients(batch_id, recipient_email);

CREATE INDEX IF NOT EXISTS idx_mailing_batches_created_at ON public.mailing_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mailing_batches_status ON public.mailing_batches(status);
CREATE INDEX IF NOT EXISTS idx_mailing_batch_recipients_batch_id ON public.mailing_batch_recipients(batch_id);

ALTER TABLE public.email_events
    ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.mailing_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_events_batch_id ON public.email_events(batch_id);

ALTER TABLE public.mailing_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mailing_batch_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage mailing batches" ON public.mailing_batches;
CREATE POLICY "Admins can manage mailing batches"
    ON public.mailing_batches
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can manage mailing batch recipients" ON public.mailing_batch_recipients;
CREATE POLICY "Admins can manage mailing batch recipients"
    ON public.mailing_batch_recipients
    FOR ALL
    USING (true)
    WITH CHECK (true);
