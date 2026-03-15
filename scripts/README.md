# Scripts

Test ve rapor scriptleri. **Tam kullanım ve komutlar:** [docs/TEST_SCRIPTS.md](../docs/TEST_SCRIPTS.md).

| Script | Kısa açıklama |
|--------|----------------|
| `run-tests.sh [all\|backend\|aiservice\|frontend]` | Docker ile tüm veya tek katman test |
| `test-backend.sh` | Backend pytest (yerel) |
| `test-aiservice.sh` | AI Service pytest (yerel) |
| `test-frontend.sh` | Frontend Vitest (yerel) |
| `test-frontend-e2e.sh` | Frontend Playwright E2E (yerel) |
| `test-all-local.sh [e2e]` | Tüm yerel testler; isteğe E2E |
| `generate-test-report.sh` | Yerel tüm testler + tek rapor dosyası |

Tüm komutlar proje **kök dizininden** çalıştırılır: `./scripts/run-tests.sh` vb.
