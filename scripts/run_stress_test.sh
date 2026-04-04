#!/bin/bash
# Proje kökünden çalıştırın. k6 yüklü değilse Docker ile k6 çalışır (--network host → localhost:8000).
# Ortam: K6_BASE_URL, K6_E2E_EMAIL, K6_E2E_PASSWORD (opsiyonel)
# JSON çıktısı: bind mount içine doğrudan yazmak bazen "permission denied" verir; bunun için ./scripts/run_stress_test_json.sh kullanın.
set -e
cd "$(dirname "$0")/.."
echo "🚀 k6 Stres Testi Başlatılıyor..."
docker run --rm -i --network host \
  -e K6_BASE_URL="${K6_BASE_URL:-http://localhost:8000}" \
  -e K6_E2E_EMAIL="${K6_E2E_EMAIL:-}" \
  -e K6_E2E_PASSWORD="${K6_E2E_PASSWORD:-}" \
  grafana/k6 run - < load-tests/stress.js
