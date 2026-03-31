# Raporlar ve Çıktı Dosyaları

Test ve coverage çalıştırmaları aşağıdaki dizinlere çıktı üretir. Bu dosyalar genelde `.gitignore` ile takip dışındadır; proje yapısının temiz kalması için tek yerden referans verilir.

---

## Özet tablo

| Çıktı türü | Konum | Nasıl oluşur |
|------------|--------|---------------|
| Backend coverage (HTML) | `backend/htmlcov/` | `pytest --cov=app --cov-report=html:htmlcov/backend` veya `scripts/run-tests.sh backend` |
| AI Service coverage (HTML) | `aiService/htmlcov/` | `pytest --cov=app --cov-report=html:htmlcov/aiservice` veya `scripts/run-tests.sh aiservice` |
| Frontend coverage (HTML) | `frontend/coverage/` | `npm run test:coverage` (Vitest) |
| Frontend E2E raporu | `frontend/playwright-report/` | `npm run test:e2e` (Playwright) |
| Test çalıştırma logu | Proje kökü: `test-results-YYYYMMDD-HHMMSS.txt` | `scripts/run-tests.sh` (Docker ile tüm testler) |

---

## Detay

### Coverage raporları

- **Backend:** `backend/htmlcov/backend/index.html` — tarayıcıda açarak satır bazlı kapsam görüntülenir.
- **AI Service:** `aiService/htmlcov/aiservice/index.html` — aynı şekilde.
- **Frontend:** `frontend/coverage/index.html` — Vitest v8 coverage çıktısı.

### Playwright E2E

- `frontend/playwright-report/index.html` — E2E test raporu (başarılı/başarısız, ekran görüntüleri vb.).

### Log dosyaları

- Uygulama logları: Proje varsayılanında `*.log` dosyaları kök `.gitignore` ile yok sayılır.
- Test çıktıları: `./scripts/run-tests.sh` ile oluşturulan `test-results-*.txt` dosyaları proje kökünde oluşur.

---

## Proje yapısında temizlik

Aşağıdaki kalıplar kök `.gitignore` içinde yer alarak bu çıktıların repoya girmemesi sağlanır:

- `backend/htmlcov/`
- `aiService/htmlcov/`
- `frontend/coverage/`
- `frontend/playwright-report/`
- `test-results-*.txt`

Bu sayede dokümanlar `docs/` altında toplanır, üretilen raporlar ise sabit konumlarda tutulur ve takip dışı bırakılır.
