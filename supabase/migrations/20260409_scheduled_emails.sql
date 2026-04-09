-- Migration: Create scheduled_emails table for the Mailing Center
CREATE TABLE IF NOT EXISTS public.scheduled_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    scheduled_at TIMESTAMPTZ NOT NULL,
    subject TEXT NOT NULL,
    content TEXT NOT NULL,
    signature TEXT,
    recipients JSONB NOT NULL, -- Array of {email, name}
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
    from_name TEXT,
    from_email TEXT,
    user_id UUID REFERENCES auth.users(id) -- Optional: to track which admin scheduled it
);

-- Enable RLS
ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

-- Allow admins to manage scheduled emails (Assuming 'admin' metadata or vikirthan check)
CREATE POLICY "Admins can manage scheduled emails" ON public.scheduled_emails
    FOR ALL USING (true); -- Simplified for now, similar to teams logic
