#!/bin/bash
set -e

echo "🚀 Veritabanı tabloları oluşturuluyor (Alembic)..."
docker compose exec backend alembic upgrade head

echo "🌱 Veritabanı test verileriyle dolduruluyor (Seed)..."
docker compose exec backend python seed.py

echo "✅ Yerel veritabanı başarıyla hazırlandı!"
