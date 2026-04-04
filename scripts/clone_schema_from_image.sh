#!/bin/bash
set -e

echo "Supabase şema görseline göre eksik tablolar oluşturuluyor..."

docker compose exec -T db psql -U myuser -d neuropdf_local <<'SQL'
CREATE TABLE IF NOT EXISTS public.schema_version (
    version_num INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.user_stats (
    user_id VARCHAR PRIMARY KEY,
    summary_count INTEGER NOT NULL DEFAULT 0,
    tools_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_stats_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Görseldeki şema mantığıyla 1 satırlık versiyon kaydı.
INSERT INTO public.schema_version (version_num)
SELECT 1
WHERE NOT EXISTS (SELECT 1 FROM public.schema_version);
SQL

echo "Kontrol: oluşturulan tablolar"
docker compose exec -T db psql -U myuser -d neuropdf_local -c \
  "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('schema_version','user_stats') ORDER BY tablename;"

echo "Tamamlandı."
