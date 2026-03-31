# Test Scriptleri Rehberi

Tüm test scriptleri `scripts/` dizinindedir. İki yöntem vardır: **Docker** ile (konteyner içinde) veya **yerel** ortamda (doğrudan `pytest` / `npm test`).

---

## Hızlı referans

| Amaç | Komut | Ortam |
|------|--------|--------|
| Tüm testler (Backend + AI + Frontend) | `./scripts/run-tests.sh` | Docker |
| Sadece backend | `./scripts/run-tests.sh backend` | Docker |
| Sadece AI Service | `./scripts/run-tests.sh aiservice` | Docker |
| Sadece frontend (Vitest) | `./scripts/run-tests.sh frontend` | Docker |
| Tüm testler yerel | `./scripts/test-all-local.sh` | Yerel |
| Backend yerel | `./scripts/test-backend.sh` | Yerel |
| AI Service yerel | `./scripts/test-aiservice.sh` | Yerel |
| Frontend Vitest yerel | `./scripts/test-frontend.sh` | Yerel |
| Frontend E2E (Playwright) | `./scripts/test-frontend-e2e.sh` | Yerel |
| E2E dahil tüm yerel testler | `./scripts/test-all-local.sh e2e` | Yerel |
| Kapsamlı rapor (yerel) | `./scripts/generate-test-report.sh` | Yerel |

---

## 1. Docker ile testler (`run-tests.sh`)

Servisler **Docker Compose** ile çalışıyorsa (`docker compose up -d` veya `docker compose up`) testleri konteyner içinde çalıştırır.

### Çalıştırma

Proje kökünden:

```bash
# Tüm testler (Backend + AI Service + Frontend)
./scripts/run-tests.sh

# Sadece backend
./scripts/run-tests.sh backend

# Sadece AI Service
./scripts/run-tests.sh aiservice

# Sadece frontend (Vitest)
./scripts/run-tests.sh frontend
```

### Çıktı

- Sonuçlar terminalde görünür.
- İsteğe bağlı: çıktı `test-results-YYYYMMDD-HHMMSS.txt` dosyasına yazılır (varsayılan).
- Coverage: Backend → `backend/htmlcov/`, AI Service → `aiService/htmlcov/`, Frontend → `frontend/coverage/` (Docker volume içinde).

### Ön koşul

- `docker compose up` ile ilgili servislerin (backend, aiservice, frontend) ayakta olması gerekir.

---

## 2. Yerel test scriptleri

Docker kullanmadan, makinede kurulu Python ve Node ile test çalıştırmak için kullanılır.

### Backend (`test-backend.sh`)

```bash
./scripts/test-backend.sh
```

- **Ne yapar:** `backend/` dizininde `pytest tests/ -v --cov=app --cov-report=term-missing` çalıştırır.
- **Ön koşul:** `backend/` içinde venv aktif ve `pip install -r requirements.txt` yapılmış olmalı.
- **Ek argüman:** `./scripts/test-backend.sh -m unit` gibi pytest argümanları verilebilir.

---

### AI Service (`test-aiservice.sh`)

```bash
./scripts/test-aiservice.sh
```

- **Ne yapar:** `aiService/` dizininde `pytest tests/ -v --cov=app --cov-report=term-missing` çalıştırır.
- **Ön koşul:** `aiService/` içinde venv aktif ve bağımlılıklar yüklü olmalı.
- **Ek argüman:** `./scripts/test-aiservice.sh -m "not chromadb"` gibi pytest argümanları verilebilir.

---

### Frontend — Vitest (`test-frontend.sh`)

```bash
./scripts/test-frontend.sh
```

- **Ne yapar:** `frontend/` dizininde `npm test -- --run --coverage` (Vitest tek seferlik + coverage).
- **Ön koşul:** `frontend/` içinde `npm install` yapılmış olmalı.

---

### Frontend — E2E Playwright (`test-frontend-e2e.sh`)

```bash
./scripts/test-frontend-e2e.sh
```

- **Ne yapar:** `frontend/` dizininde `npm run test:e2e` (Playwright E2E testleri).
- **Ön koşul:**
  - Uygulama **http://localhost:3000** adresinde çalışıyor olmalı (`npm run dev` veya Docker frontend).
  - `frontend/` içinde `npm install` ve `npx playwright install` (gerekirse) yapılmış olmalı.
- **Ek argüman:** `./scripts/test-frontend-e2e.sh --project=chromium` gibi Playwright argümanları verilebilir.

---

### Tüm yerel testler (`test-all-local.sh`)

```bash
# Backend + AI Service + Frontend (Vitest); E2E yok
./scripts/test-all-local.sh

# E2E dahil (uygulama localhost:3000'de çalışıyor olmalı)
./scripts/test-all-local.sh e2e
```

- **Ne yapar:** Sırayla `test-backend.sh`, `test-aiservice.sh`, `test-frontend.sh` çalıştırır. `e2e` parametresi verilirse sonunda `test-frontend-e2e.sh` de çalışır.
- **Ön koşul:** Backend ve AI Service için Python ortamı, frontend için npm ortamı hazır olmalı.

---

## 3. Rapor üretici (`generate-test-report.sh`)

Yerel ortamda tüm testleri çalıştırıp tek bir metin raporu üretir.

```bash
./scripts/generate-test-report.sh
```

- **Çıktı:** `test-reports/test_report_YYYYMMDD_HHMMSS.txt`
- **İçerik:** Backend, AI Service ve Frontend test çıktıları + coverage bilgisi.
- **Ön koşul:** Backend, aiService ve frontend dizinlerinde bağımlılıklar kurulu, yerel ortamda çalıştırılır.

---

## Özet tablo (script dosyaları)

| Script | Açıklama | Ortam |
|--------|----------|--------|
| `run-tests.sh` | Tüm veya tek katman (backend/aiservice/frontend); çıktı dosyaya yazılabilir | Docker |
| `test-backend.sh` | Backend pytest | Yerel |
| `test-aiservice.sh` | AI Service pytest | Yerel |
| `test-frontend.sh` | Frontend Vitest (--run --coverage) | Yerel |
| `test-frontend-e2e.sh` | Frontend Playwright E2E | Yerel |
| `test-all-local.sh` | Backend + AI + Frontend (Vitest); isteğe `e2e` | Yerel |
| `generate-test-report.sh` | Tüm testler + tek rapor dosyası | Yerel |

---

## Nerede çalıştırılır?

Tüm komutlar **proje kök dizininden** çalıştırılmalıdır:

```bash
cd /path/to/NeuroPDF
./scripts/run-tests.sh
./scripts/test-backend.sh
# ...
```

Scriptler kendi içinde ilgili alt dizine (`backend/`, `aiService/`, `frontend/`) geçer.
