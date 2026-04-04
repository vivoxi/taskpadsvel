# Supabase Notes

This directory records database expectations that the app relies on.

## Migrations

- [migrations/20260404_enable_rls_and_lock_public_tables.sql](/Users/mbtkimya/Documents/taskpad%20svelte/supabase/migrations/20260404_enable_rls_and_lock_public_tables.sql)

That migration assumes:

- the app reads and writes through server endpoints
- server-side code uses `SUPABASE_SERVICE_KEY`
- browser clients do not access the public tables directly

## Existing Projects

If you already ran the SQL manually in Supabase, keep this migration as the source-of-truth for future environments. You do not need to rerun it unless you are provisioning another database or intentionally reconciling drift.

## Fresh Projects

Create the required tables first, then apply the migration so RLS, revoked grants, and deny-all policies match the application.
