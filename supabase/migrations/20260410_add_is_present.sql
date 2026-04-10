-- Add is_present column to teams table
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS is_present BOOLEAN DEFAULT false;

-- Update RLS policies if needed (already handled by existing policies on teams)
