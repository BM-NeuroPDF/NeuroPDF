#!/bin/bash
# JSON metrik çıktısı (NDJSON). Özet tablo stderr'de kalır; dosya yazımı host tarafında (Docker bind mount izin sorunu yok).
# Kullanım: ./scripts/run_stress_test_json.sh [çıktı-dosyası]
# Varsayılan: load-tests/results.ndjson (NDJSON; .json uzantısı tek JSON belgesi sanılır)
set -e
cd "$(dirname "$0")/.."
OUT="${1:-load-tests/results.ndjson}"
mkdir -p "$(dirname "$OUT")"

echo "🚀 k6 (JSON → ${OUT}), özet terminalde (stderr)..."
docker run --rm -i --network host \
  -e K6_BASE_URL="${K6_BASE_URL:-http://localhost:8000}" \
  -e K6_E2E_EMAIL="${K6_E2E_EMAIL:-}" \
  -e K6_E2E_PASSWORD="${K6_E2E_PASSWORD:-}" \
  grafana/k6 run --quiet --no-summary --out json=- - < load-tests/stress.js \
  > "$OUT"

echo "✅ Yazıldı: $OUT"
