CREATE TABLE IF NOT EXISTS "public"."tasks"
(
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);
