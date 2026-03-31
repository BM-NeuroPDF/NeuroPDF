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
| **assets/** | Demo GIF vb. (ör. `demo.gif`). |

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
```
