#!/bin/bash
set -e

echo "Supabase şeması indiriliyor (Sadece tablolar, veri yok)..."
read -s -p "Supabase DB şifresi: " SUPABASE_DB_PASSWORD
echo ""

if [ -z "$SUPABASE_DB_PASSWORD" ]; then
  echo "Hata: Şifre boş olamaz."
  exit 1
fi

export PGPASSWORD="$SUPABASE_DB_PASSWORD"
pg_dump \
  -h aws-1-ap-southeast-1.pooler.supabase.com \
  -p 5432 \
  -U postgres.rnhxdipbwfgbwfyqpuqz \
  -d postgres \
  -s -O -x -c \
  -f supabase_schema.sql
unset PGPASSWORD

echo "Şema yerel Docker veritabanına aktarılıyor..."
cat supabase_schema.sql | docker compose exec -T db psql -U myuser -d neuropdf_local

echo "Alembic geçmişi senkronize ediliyor..."
docker compose exec -T backend alembic stamp head

echo "Tamamlandı: Supabase şeması local DB'ye klonlandı."
