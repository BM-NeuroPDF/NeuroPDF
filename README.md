# NeuroPDF

**Tarayıcı üzerinde çalışan, otonom kararlar alabilen ve uzun süreli hafızaya sahip Yapay Zeka Destekli PDF İşletim Sistemi.**

[![CI](https://github.com/suleymanngulter/NeuroPDF/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/suleymanngulter/NeuroPDF/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
[![Playwright](https://img.shields.io/badge/Playwright-45ba4b?logo=playwright&logoColor=white)](https://playwright.dev/)
![Prettier](https://img.shields.io/badge/Prettier-F7B93E?logo=prettier&logoColor=black)
![Ruff](https://img.shields.io/badge/Ruff-D7FF64?logo=ruff&logoColor=black)

![NeuroPDF Demo](docs/assets/demo.gif)

> *Demo GIF:* `docs/assets/demo.gif` dosyasını eklediğinizde önizleme burada görünür.

---

## İçindekiler

| Bölüm | Açıklama |
|-------|----------|
| [Süper güçler](#birlikte-inşa-ettiğimiz-süper-güçler) | Ajan motoru, istemci eylemleri, bilişsel araçlar, hafıza, UX, QA |
| [Teknoloji yığını](#teknoloji-yığını) | Next.js, FastAPI, AI, veri katmanı |
| [Hızlı başlangıç](#hızlı-başlangıç) | Yerel kurulum, Alembic, servisler |
| [Docker](#docker-ile-çalıştırma) | Tek komutla stack |
| [Testler](#test-rehberi) | Vitest, Pytest, Playwright |
| [Dokümantasyon](#dokümantasyon) | Mimari, API, strateji |

---

## Birlikte inşa ettiğimiz süper güçler

### Otonom ajan motoru (Tool routing)

NeuroPDF, kullanıcı niyetini tek bir “sihirli düğme”ye sıkıştırmaz. AI katmanı, **sağlayıcıdan bağımsız** (Google **Gemini** veya yerel **Ollama**) çalışan LLM ile **araç seçimini** kendisi yapar: metin üretmek yetmediğinde **bilişsel** araçlara (ör. özetleme, çeviri) veya **istemci tarafı** işlere (kesme, birleştirme) yönlendirir. Araç çağrıları yapılandırılmış `<tool_call>` çıktıları ve bir **dispatch registry** üzerinden yürür; böylece “hangi iş nerede çalışır?” sorusu mimari olarak açık kalır. Ayrıntılı akış: [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md).

### Sıfır maliyetli istemci eylemleri (Zero-compute)

PDF **kesme**, **birleştirme** ve arayüzdeki hafif düzenlemeler, mümkün olduğunda **sunucu CPU’suna yük bindirmeden** tarayıcıda **pdf-lib** ile tamamlanır. Bu sayede hem maliyet hem gecikme düşer; ağır bilişsel iş yükü ile “dosya operasyonu” net biçimde ayrılır.

### Bilişsel araçlar (Cognitive tools)

Sunucu tarafında **SummarizePdfTool** ve **TranslatePdfTool** gibi dinamik araçlar, PDF’ten çıkarılan metnin belirli bir üst sınırına (yaklaşık **20.000 karakter**) kadar bağlamı modele iletebilir; özet formatı ve çeviri dili gibi parametreler kullanıcı niyetine göre şekillenir.

### Uzun süreli hafıza (Long-term memory)

Sohbet oturumları **PostgreSQL** üzerinde saklanır; şema evrimi **Alembic** ile yönetilir. AI servisi ve backend, oturumları listeleyip mesajları yükleyebilir; **restore / resume** akışıyla kullanıcı geçmiş sohbete döndüğünde bağlam kesintisiz devam edebilir (ör. `GET/POST .../files/chat/sessions/...`).

### Premium UX

- **Sihirli komut çipleri (Magic chips):** Bağlama duyarlı hızlı komutlar.
- **Auto-scroll:** Sohbet listesinde yeni mesaj ve geçmiş yüklemede akıcı kaydırma.
- **Ellipsis + `title`:** Uzun başlıklarda panel düzenini bozmadan tam metin ipucu.
- **Tailwind** ve **Framer Motion** ile tutarlı, modern arayüz animasyonları.

### Dört katmanlı savunma hattı (Enterprise QA ve DevOps)

1. **Pre-commit (kapı nöbetçileri):** [Husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged) — **Ruff**, **ESLint**, **Prettier** yalnızca *staged* dosyalarda. Rehber: [docs/devops/PRE_COMMIT.md](docs/devops/PRE_COMMIT.md).
2. **Birim ve entegrasyon testleri:** **100+** yeşil **Pytest** (backend & AI Service) ve **Vitest** (frontend unit + integration). Kesin sayılar ve kategoriler: [docs/testing/TEST_STRATEGY.md](docs/testing/TEST_STRATEGY.md).
3. **E2E:** **Playwright** senaryoları; kritik akışlarda **network interception** (`page.route`) ile kararlı mock. Örnek: sohbet geçmişi (`chat-history.spec.ts`).
4. **CI/CD:** [GitHub Actions](.github/workflows/ci.yml) — **Postgres servisli** backend testleri, frontend Vitest, ardından Playwright (Chromium); HTML rapor artifact. E2E job’da harici auth/backend kısıtları için `continue-on-error` kullanılıyorsa [docs/devops/CI.md](docs/devops/CI.md) notlarına bakın.

---

## Teknoloji yığını

| Katman | Teknolojiler |
|--------|----------------|
| **Frontend** | Next.js (App Router), React, TypeScript, Tailwind CSS, NextAuth.js, pdf-lib, Framer Motion |
| **Backend** | FastAPI, JWT, PostgreSQL / Supabase, Redis, Alembic |
| **AI Service** | FastAPI, Gemini & Ollama, RAG (ChromaDB), Celery, yapılandırılmış tool / ajan döngüsü |
| **QA & DX** | Vitest, Pytest, Playwright, Husky, lint-staged, Prettier, Ruff (npm) |

---

## Hızlı başlangıç

### Gereksinimler

| Bileşen | Not |
|---------|-----|
| Node.js | 20+ |
| Python | 3.13 önerilir (backend Dockerfile ile uyumlu) |
| PostgreSQL | 14+ (yerel veya Supabase) |
| Redis | Cache, rate limit, Celery broker |

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

`backend/.env` için özet: `JWT_SECRET`, `FRONTEND_ORIGIN`, `REDIS_URL`, `AI_SERVICE_URL`, `SUPABASE_URL` / `SUPABASE_KEY` (prod), veritabanı bağlantı değişkenleri.

Veritabanı şeması:

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
```

Sunucu:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. AI Service

```bash
cd aiService
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

`aiService/.env`: `GEMINI_API_KEY`, `REDIS_URL`, isteğe bağlı Ollama / `AI_SERVICE_API_KEY`.

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

Arka plan işleri için ayrı terminal:

```bash
celery -A app.tasks.celery_worker:celery_app worker --loglevel=info
```

### 3. Frontend

```bash
cd frontend
npm install
```

`frontend/.env.local`: `NEXT_PUBLIC_API_URL`, `BACKEND_API_URL`, `NEXTAUTH_SECRET` (veya `AUTH_SECRET`), Google OAuth anahtarları (kullanılıyorsa).

```bash
npm run dev
```

Uygulama: **http://localhost:3000**

---

## Docker ile çalıştırma

```bash
docker compose up --build
```

Ön koşul: `backend/.env`, `aiService/.env`, `frontend/.env.local` (Compose içinde backend hostname vb. için bkz. [docs/devops/docker-auth-and-logging.md](docs/devops/docker-auth-and-logging.md)).

| Servis | Port |
|--------|------|
| Frontend | 3000 |
| Backend | 8000 |
| AI Service | 8001 |
| Redis | 6379 |

---

## Test rehberi

| Katman | Komut (özet) |
|--------|----------------|
| Frontend | `cd frontend && npm run test:run` |
| Backend | `cd backend && pytest tests/ -v` |
| AI Service | `cd aiService && pytest tests/ -v` |
| E2E | `cd frontend && npm run test:e2e:chromium` |

Docker ile toplu script: `./scripts/run-tests.sh`. Strateji ve sayılar: [docs/testing/TEST_STRATEGY.md](docs/testing/TEST_STRATEGY.md). CI açıklaması: [docs/devops/CI.md](docs/devops/CI.md).

**E2E dosya örnekleri:** `auth`, `guest-limits`, `pdf-upload`, `pdf-summarize`, `pdf-merge`, `pdf-chat`, `chat-actions`, `chat-history`, `profile`.

---

## Dokümantasyon

| Kaynak | Açıklama |
|--------|----------|
| [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) | 360° mimari, Mermaid, tool routing |
| [docs/reference/API_REFERENCE.md](docs/reference/API_REFERENCE.md) | Chat ve dosya API’leri |
| [docs/testing/TEST_STRATEGY.md](docs/testing/TEST_STRATEGY.md) | Test sayıları ve yapılandırma |
| [docs/devops/PRE_COMMIT.md](docs/devops/PRE_COMMIT.md) | Husky / lint-staged |
| [docs/devops/CI.md](docs/devops/CI.md) | GitHub Actions |
| [docs/devops/docker-auth-and-logging.md](docs/devops/docker-auth-and-logging.md) | Docker auth |
| [docs/README.md](docs/README.md) | Tüm doküman indeksi |

---

## Lisans ve katkı

Lisans: proje kökündeki `LICENSE` (varsa). Issue ve pull request’ler memnuniyetle karşılanır.
