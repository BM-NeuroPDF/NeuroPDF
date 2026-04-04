# Projedeki Markdown (.md) dosyaları rehberi

Bu doküman, NeuroPDF projesindeki Markdown dosyalarının konumunu, amacını ve ne zaman kullanılacağını listeler.

---

## Kök dizin

| Dosya | Açıklama | Ne zaman kullanılır |
|-------|----------|---------------------|
| **README.md** | Ana giriş: kurulum, Docker, test, özellikler, dokümantasyon haritası. | Yeni geliştiriciler ve genel bakış. |

---

## Frontend dizini (`frontend/`)

| Dosya | Açıklama | Ne zaman kullanılır |
|-------|----------|---------------------|
| **README.md** | `docs/frontend/` ve `docs/testing/frontend/` yönlendirmesi. | Frontend kökünden nereye bakılacağını görmek için. |

---

## Backend dizini (`backend/`)

| Dosya | Açıklama | Ne zaman kullanılır |
|-------|----------|---------------------|
| **tests/README.md** | Asıl rehber: `docs/testing/backend-tests.md`. | Pytest yapısı ve çalıştırma. |
| **app/docs/EULA_TR.md** / **EULA_EN.md** | Kayıt akışında gösterilen yasal metinler. | **Taşınmamalı.** |

---

## AI Service dizini (`aiService/`)

| Dosya | Açıklama | Ne zaman kullanılır |
|-------|----------|---------------------|
| **README.md** | LLM entegrasyonu (Gemini / Ollama), prompt mühendisliği ve RAG (ChromaDB) özet mimarisi; çalıştırma ve test girişi. | AI katmanı ve mikro servis davranışı. |

---

## Yük testleri (`load-tests/`)

| Dosya | Açıklama | Ne zaman kullanılır |
|-------|----------|---------------------|
| **README.md** | k6 senaryosu: `GET /files/chat/sessions` üzerinden bağlantı havuzu davranışı; auth rate limit ile çakışmayı önleyen tek seferlik login (`setup`); aşamalı VU profili. | Stres testi tasarımı ve metrik yorumu. |

---

## Scripts dizini (`scripts/`)

| Dosya | Açıklama | Ne zaman kullanılır |
|-------|----------|---------------------|
| **README.md** | Test/rapor betikleri; **veritabanı:** `bootstrap_local_db.sh` (Alembic + seed), `clone_schema.sh` / `clone_schema_from_image.sh` (şema klonlama); **k6:** `run_stress_test.sh`, `run_stress_test_json.sh` (NDJSON çıktı); **teslim:** `compile_report.sh` (birleşik Markdown raporu). | Operasyon ve akademik rapor üretimi. |

---

## Dokümantasyon merkezi (`docs/`)

### Kök (`docs/`)

| Dosya | Açıklama |
|-------|----------|
| **README.md** | İndeks: `architecture/`, `devops/`, `reference/`, `testing/`, `frontend/`, `legal/`, `assets/`. |
| **MARKDOWN_FILES.md** | Bu dosya — tüm `.md` envanteri. |

### Mimari — `docs/architecture/`

| Dosya | Açıklama |
|-------|----------|
| **ARCHITECTURE.md** | Sistem mimarisi, Mermaid, tool routing, DB/LLM. |

### DevOps ve operasyon — `docs/devops/`

| Dosya | Açıklama |
|-------|----------|
| **CI.md** | GitHub Actions workflow, E2E notları. |
| **PRE_COMMIT.md** | Husky, lint-staged, Ruff/ESLint/Prettier. |
| **docker-auth-and-logging.md** | Docker’da auth, loglar, sorun giderme. |

### Referans — `docs/reference/`

| Dosya | Açıklama |
|-------|----------|
| **API_REFERENCE.md** | Chat ve dosya HTTP API’leri. |
| **reports-and-outputs.md** | Coverage, Playwright raporu, test log dosyalarının konumları. |

### Testler — `docs/testing/`

| Dosya / klasör | Açıklama |
|----------------|----------|
| **README.md** | Test ağacı indeksi. |
| **TEST_STRATEGY.md** | Sayılar, Vitest/Pytest/Playwright, Fedora. |
| **TEST_SCRIPTS.md** | `scripts/` test komutları. |
| **backend-tests.md** | Backend pytest rehberi. |
| **reports/** | Arşiv raporlar: `COMPREHENSIVE_TEST_REPORT.md`, `TEST_IMPLEMENTATION_REPORT.md`, `UNIT_TEST_REPORT.md`, `SECURITY_IMPROVEMENTS_REPORT.md`. |
| **frontend/** | Vitest/Playwright notları, `WEBKIT_FIX.md` vb. |

### Diğer `docs/` alt klasörleri

| Konum | Açıklama |
|-------|----------|
| **frontend/README.md** | Frontend kurulum ve çalıştırma. |
| **legal/README.md** | EULA referansları. |
| **assets/** | Statik varlıklar (örnek görseller, ek materyaller). |

---

## Özet akış

```
İlk giriş / kurulum     → README.md (kök)
Doküman haritası        → docs/README.md
Bu envanter             → docs/MARKDOWN_FILES.md
Mimari                  → docs/architecture/ARCHITECTURE.md
API & çıktı konumları   → docs/reference/
CI, hook, Docker log    → docs/devops/
Test strateji & script  → docs/testing/ (+ testing/reports/)
AI Service özeti        → aiService/README.md
Yük / stres testi       → load-tests/README.md
Betikler (DB, k6, rapor)→ scripts/README.md
Birleşik teslim raporu  → ./scripts/compile_report.sh → NeuroPDF_Final_Report.md
```
