-- Stub setup applied to the plain Postgres test container before Flyway migrations run.
-- Mimics baseline Supabase-managed extensions; no project migration currently needs more than this.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
