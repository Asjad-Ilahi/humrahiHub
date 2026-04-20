-- Optional: set existing “needs initiation” issues to 1 vote required (demo).
UPDATE public.issues SET initiation_threshold = 1 WHERE phase = 'needs_initiation';
