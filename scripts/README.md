# Scripts

Test, rapor, veritabanı ve yük testi betikleri. **Test komutlarının tam listesi:** [docs/testing/TEST_SCRIPTS.md](../docs/testing/TEST_SCRIPTS.md).

## Test ve rapor

| Script | Kısa açıklama |
|--------|----------------|
| `run-tests.sh [all\|backend\|aiservice\|frontend]` | Docker ile tüm veya tek katman test |
| `test-backend.sh` | Backend pytest (yerel) |
| `test-aiservice.sh` | AI Service pytest (yerel) |
| `test-frontend.sh` | Frontend Vitest (yerel) |
| `test-frontend-e2e.sh` | Frontend Playwright E2E (yerel) |
| `test-all-local.sh [e2e]` | Tüm yerel testler; isteğe E2E |
| `generate-test-report.sh` | Yerel tüm testler + tek rapor dosyası |
| `compile_report.sh` | Kök README, mimari, API ve test belgelerini `NeuroPDF_Final_Report.md` içinde birleştirir (akademik/kurumsal teslim) |

## Veritabanı ve şema

| Script | Kısa açıklama |
|--------|----------------|
| `bootstrap_local_db.sh` | Docker Compose içinde Alembic `upgrade head` ve `dev_only/seed.py` ile yerel DB’yi şema + örnek veriyle hazırlar |
| `clone_schema.sh` | Supabase üzerinden yalnızca şema (`pg_dump -s`) alıp yerel Docker Postgres’e aktarır (parola etkileşimli) |
| `clone_schema_from_image.sh` | Yerel Docker DB’de referans şemaya göre eksik tabloları ekler (`schema_version`, `user_stats` vb.) |

## k6 stres testi

| Script | Kısa açıklama |
|--------|----------------|
| `run_stress_test.sh` | k6’yı Docker ile çalıştırır; `load-tests/stress.js` — özet terminalde |
| `run_stress_test_json.sh [çıktı]` | Aynı senaryo; ham metrikleri NDJSON dosyasına yazar (varsayılan: `load-tests/results.ndjson`) |

Senaryo ayrıntıları: [load-tests/README.md](../load-tests/README.md).

Tüm komutlar proje **kök dizininden** çalıştırılır: `./scripts/run-tests.sh` vb.
