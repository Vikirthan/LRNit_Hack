-- Migration: Remove FK constraint on teacher_scores.teacher_id
-- The local account system uses user_accounts (not auth.users),
-- so the FK to auth.users causes violations when teachers submit scores.

ALTER TABLE public.teacher_scores
DROP CONSTRAINT IF EXISTS teacher_scores_teacher_id_fkey;
