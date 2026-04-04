#!/usr/bin/env bash
# NeuroPDF — akademik / kurumsal teslim için birleşik Markdown raporu üretir.
# Kullanım (proje kökünden): ./scripts/compile_report.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/NeuroPDF_Final_Report.md"

section() {
  printf '\n\n---\n\n## %s\n\n' "$1"
}

{
  printf '# NeuroPDF — Birleştirilmiş Teknik Rapor\n\n'
  printf '_Bu dosya `scripts/compile_report.sh` ile otomatik üretilmiştir; kaynak bölümler aşağıda sırayla birleştirilmiştir._\n'

  section "1. Proje özeti (kök README)"
  cat "${ROOT}/README.md"

  section "2. Mimari (ARCHITECTURE)"
  cat "${ROOT}/docs/architecture/ARCHITECTURE.md"

  section "3. API referansı (API_REFERENCE)"
  cat "${ROOT}/docs/reference/API_REFERENCE.md"

  section "4. Test stratejisi (TEST_STRATEGY)"
  cat "${ROOT}/docs/testing/TEST_STRATEGY.md"

  section "5. Kapsamlı test raporu (COMPREHENSIVE_TEST_REPORT)"
  cat "${ROOT}/docs/testing/reports/COMPREHENSIVE_TEST_REPORT.md"

} > "$OUT"

echo "✅ Birleşik rapor yazıldı: $OUT"
echo "   Repoya eklemek için: git add -f NeuroPDF_Final_Report.md"
