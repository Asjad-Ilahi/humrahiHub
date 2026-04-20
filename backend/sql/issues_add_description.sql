-- Run once if `issues` already exists without `description`.
ALTER TABLE public.issues
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
