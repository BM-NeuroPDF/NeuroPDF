# NeuroPDF

**AI destekli PDF işleme ve sohbet platformu.** Özetleme, birleştirme, sayfa çıkarma, düzenleme ve PDF üzerinde RAG tabanlı sohbet özellikleri sunar. **Yayına hazır (Production Ready)** statüsündedir; Global ProChat, Dynamic RAG ve cross-browser E2E testleri ile doğrulanmıştır.

---

## İçindekiler

| Bölüm | Açıklama |
|-------|----------|
| [🛠️ Kurulum (Setup)](#-kurulum-setup) | Frontend, Backend ve AI Service adım adım kurulum |
| [🐳 Docker ile Çalıştırma](#-docker-ile-çalıştırma) | Tek komutla tüm servisleri ayağa kaldırma |
| [🧪 Test Rehberi](#-test-rehberi) | Vitest, Pytest ve Playwright testlerini çalıştırma |
| [✨ Özellikler](#-özellikler) | PDF araçları ve platform özellikleri |
| [📚 Dokümantasyon](#-dokümantasyon) | Mimari, test stratejisi, API referansı, raporlar |

**Dokümantasyon:** Mimari [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md), test stratejisi ve final sayılar [docs/TEST_STRATEGY.md](docs/TEST_STRATEGY.md), chat API referansı [docs/API_REFERENCE.md](docs/API_REFERENCE.md), raporlar ve çıktılar [docs/reports-and-outputs.md](docs/reports-and-outputs.md), Docker auth [docs/docker-auth-and-logging.md](docs/docker-auth-and-logging.md). Tüm dokümanlar: [docs/README.md](docs/README.md).

---

## 🛠️ Kurulum (Setup)

Aşağıdaki adımlar **yerel geliştirme** ortamı için geçerlidir. Önce **Redis** ve (AI özellikleri için) **PostgreSQL** çalışır durumda olmalıdır.

### Gereksinimler

| Bileşen | Versiyon |
|---------|----------|
| Node.js | 20+ (önerilen: 22) |
| Python | 3.11+ (Backend & AI Service: 3.13 kullanılıyor) |
| Redis | 7.x |
| PostgreSQL | 14+ (Supabase kullanılıyorsa harici) |
| (Opsiyonel) Ollama | Yerel LLM için |

---

### Backend Kurulumu

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

**Ortam değişkenleri** — `backend/.env` dosyası oluşturun:

| Değişken | Zorunlu | Açıklama | Örnek |
|----------|---------|----------|--------|
| `JWT_SECRET` | Evet (prod) | JWT imzalama anahtarı | Güçlü rastgele string |
| `FRONTEND_ORIGIN` | Hayır | CORS izin verilen origin | `http://localhost:3000` |
| `REDIS_URL` | Hayır | Redis bağlantı URL'si | `redis://localhost:6379` |
| `AI_SERVICE_URL` | Hayır | AI servis adresi | `http://localhost:8001` |
| `SUPABASE_URL` | Evet (prod) | Supabase proje URL | `https://xxx.supabase.co` |
| `SUPABASE_KEY` | Evet (prod) | Supabase anon/service key | `eyJ...` |
| `GOOGLE_CLIENT_ID` | Opsiyonel | Google OAuth | — |
| `GEMINI_API_KEY` | Opsiyonel | Google Gemini API | — |
| `MAX_GUEST_USAGE` | Hayır | Misafir kullanım limiti | `3` |
| `MAX_FILE_SIZE_GUEST_MB` | Hayır | Misafir dosya boyutu (MB) | `5` |
| `MAX_FILE_SIZE_USER_MB` | Hayır | Kullanıcı dosya boyutu (MB) | `7` |

Çalıştırma:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

### AI Service Kurulumu

```bash
cd aiService
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Ortam değişkenleri** — `aiService/.env` dosyası oluşturun:

| Değişken | Zorunlu | Açıklama | Örnek |
|----------|---------|----------|--------|
| `GEMINI_API_KEY` | Evet | Google Gemini API anahtarı | — |
| `REDIS_URL` | Evet | Celery/Redis kuyruk URL'si | `redis://localhost:6379` |
| `OLLAMA_HOST` | Hayır | Ollama adresi (yerel LLM) | `http://localhost:11434` |
| `OLLAMA_MODEL` | Hayır | Ollama model adı | `gemma2:9b` veya `phi3:mini` |
| `ELEVENLABS_API_KEY` | Hayır | TTS (seslendirme) için | — |
| `AI_SERVICE_API_KEY` | Hayır | Backend ↔ AI Service güvenliği (prod) | — |

Çalıştırma:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

Celery worker (async işler için) ayrı terminalde:

```bash
celery -A app.tasks.celery_worker:celery_app worker --loglevel=info
```

---

### Frontend Kurulumu

```bash
cd frontend
npm install
```

**Ortam değişkenleri** — `frontend/.env.local` dosyası oluşturun:

| Değişken | Zorunlu | Açıklama | Örnek |
|----------|---------|----------|--------|
| `NEXT_PUBLIC_API_URL` | Hayır | Backend API base URL | `http://localhost:8000` |
| `BACKEND_API_URL` | Evet (auth) | Backend URL (NextAuth sunucu tarafı) | `http://localhost:8000` |
| `NEXTAUTH_SECRET` | Evet (auth) | NextAuth şifreleme anahtarı | Rastgele string |
| `AUTH_SECRET` | Evet (auth) | Auth.js secret (NextAuth alternatifi) | Rastgele string |
| `GOOGLE_CLIENT_ID` | Opsiyonel | Google OAuth | — |
| `GOOGLE_CLIENT_SECRET` | Opsiyonel | Google OAuth | — |
| `NEXT_PUBLIC_MAX_FILE_SIZE_GUEST_MB` | Hayır | Misafir max dosya (MB) | `5` |
| `NEXT_PUBLIC_MAX_FILE_SIZE_USER_MB` | Hayır | Kullanıcı max dosya (MB) | `7` |

Çalıştırma:

```bash
npm run dev
```

Tarayıcıda: **http://localhost:3000**

---

## 🐳 Docker ile Çalıştırma

Tüm servisleri **tek komutla** ayağa kaldırmak için Docker Compose kullanın.

### Tek komut

```bash
# Proje kök dizininde
docker compose up --build
```

Bu komut şunları başlatır:

| Servis | Port | Açıklama |
|--------|------|----------|
| Frontend | 3000 | Next.js uygulaması |
| Backend | 8000 | FastAPI API |
| AI Service | 8001 | Özetleme, chat, RAG |
| Redis | 6379 | Cache & Celery broker |
| Ollama | 11434 | Yerel LLM (opsiyonel kullanım) |
| aiCeleryWorker | — | Arka plan AI işleri |

### Ön koşul: `.env` dosyaları

Docker öncesi aşağıdaki dosyaların **proje köküne göre** var olduğundan emin olun:

- `backend/.env` — Backend ayarları (en azından `JWT_SECRET`, `REDIS_URL` vb.)
- `aiService/.env` — **GEMINI_API_KEY** ve **REDIS_URL** zorunlu
- `frontend/.env.local` — `NEXT_PUBLIC_API_URL`, `BACKEND_API_URL`, `NEXTAUTH_SECRET` / `AUTH_SECRET`

**Docker'da giriş (auth):** Frontend konteyneri backend'e `BACKEND_API_URL` ile bağlanır. Compose içinde bu değer `http://backend:8000` olarak ayarlanır (`.env.local` içindeki `localhost` override edilir). Docker kurulum adımları ve auth ayarı [docs/docker-auth-and-logging.md](docs/docker-auth-and-logging.md) ile uyumludur.

### Faydalı komutlar

```bash
# Arka planda çalıştır
docker compose up -d --build

# Logları izle
docker compose logs -f

# Sadece backend + redis + frontend (AI olmadan)
docker compose up backend redis_cache frontend
```

---

## 🧪 Test Rehberi

Projede **Vitest** (frontend birim/entegrasyon), **Pytest** (backend & AI service) ve **Playwright** (E2E) testleri bulunur. Final test sonuçları ve strateji (27 E2E, 128 unit, 41 integration, Fedora konfigürasyonu): [docs/TEST_STRATEGY.md](docs/TEST_STRATEGY.md).

### Hızlı özet

| Katman | Araç | Komut (yerel) | Açıklama |
|--------|------|----------------|----------|
| Frontend unit/integration | Vitest | `npm test` / `npm run test:coverage` | Bileşen, hook, context, API mock |
| Backend | Pytest | `pytest tests/ -v --cov=app` | API, auth, storage, rate limit |
| AI Service | Pytest | `pytest tests/ -v --cov=app` | PDF, LLM, RAG, TTS, format |
| E2E (tarayıcı) | Playwright | `npm run test:e2e` | Akış testleri (auth, PDF, chat) |
| Hepsi (Docker) | Script | `./scripts/run-tests.sh` | Backend + AI + Frontend testleri |

---

### Frontend testleri (Vitest)

Frontend dizininde çalıştırın (`frontend/`).

| Komut | Açıklama |
|-------|----------|
| `npm test` | Vitest watch modu (değişiklikte tekrar çalışır) |
| `npm run test:run` | Tek seferlik çalıştırma |
| `npm run test:coverage` | Coverage raporu (terminal + HTML) |
| `npm run test:unit` | Sadece `src/__tests__/unit` |
| `npm run test:integration` | Sadece `src/__tests__/integration` |

**Ne test edilir?**

- Bileşenler: `PdfChatPanel`, `PdfViewer`, `ProGlobalChat`, `NavBar`, `AuthBar`, `LanguageSwitcher`, `UsageLimitModal`
- Context'ler: `PdfContext`, `PopupContext`, `LanguageContext`
- Hook'lar: `usePopup`, `useGuestLimit`
- Utils: `api` (fetch, hata işleme)
- Sayfa: Ana sayfa (`page.test.tsx`)
- Entegrasyon: Upload, PDF işlemleri, chat (MSW ile API mock)

---

### Backend testleri (Pytest)

Backend dizininde çalıştırın (`backend/`).

| Komut | Açıklama |
|-------|----------|
| `pytest tests/ -v` | Tüm testler, verbose |
| `pytest tests/ -v --cov=app --cov-report=term-missing` | Coverage ile |
| `pytest tests/ -v -m unit` | Sadece unit marker'lı testler |
| `pytest tests/ -v -m integration` | Sadece entegrasyon testleri |

**Test kategorileri (markers):**

| Marker | Açıklama |
|--------|----------|
| `unit` | Birim testleri (DB mock, bağımlılıklar taklit) |
| `integration` | Gerçek DB/Redis kullanımı |
| `api` | FastAPI TestClient ile endpoint testleri |

**Dizin yapısı:**

- `tests/unit/` — auth, storage, avatar, security
- `tests/api/` — auth endpoints, files, guest, user avatar
- `tests/integration/` — guest session, PDF işlemleri, kullanıcı işlemleri, DB modelleri

---

### AI Service testleri (Pytest)

AI Service dizininde çalıştırın (`aiService/`).

| Komut | Açıklama |
|-------|----------|
| `pytest tests/ -v` | Tüm testler |
| `pytest tests/ -v --cov=app` | Coverage ile |
| `pytest tests/ -v -m chromadb` | ChromaDB/RAG testleri |
| `pytest tests/ -v -m llm_mock` | LLM mock & güvenlik testleri |

**Test kategorileri (markers):**

| Marker | Açıklama |
|--------|----------|
| `chromadb` | RAG / ChromaDB (chromadb kurulu olmalı) |
| `llm_mock` | LLM mock ve prompt injection güvenliği |
| `format` | AI yanıt formatı (JSON/Markdown) |
| `async_ai` | Async AI endpoint testleri |

**Dosya bazlı özet:**

- `test_pdf_service.py` — PDF işleme
- `test_llm_manager.py` / `test_local_llm_service.py` — LLM yönetimi
- `test_chromadb_rag.py` — RAG/vektör store
- `test_tts_manager.py` — TTS (ElevenLabs)
- `test_analysis_router.py` — Analiz endpoint'leri
- `test_response_format.py` — Yanıt formatı
- `test_llm_mocking_and_safety.py` — Güvenlik
- `test_api_key.py` — API key doğrulama

---

### E2E testleri (Playwright)

Frontend dizininde çalıştırın. Uygulama **http://localhost:3000** adresinde çalışıyor olmalı.

| Komut | Açıklama |
|-------|----------|
| `npm run test:e2e` | Varsayılan tarayıcıda tüm E2E |
| `npm run test:e2e:chromium` | Sadece Chromium |
| `npm run test:e2e:firefox` | Sadece Firefox |
| `npm run test:e2e:webkit` | Sadece WebKit |
| `npm run test:e2e:cross-browser` | Üç tarayıcı |
| `npm run test:e2e:ui` | Playwright UI modu |
| `npm run test:e2e:failed` | Sadece son başarısız testler |

**E2E senaryoları (`e2e/tests/`):**

| Dosya | Senaryo |
|-------|---------|
| `auth.spec.ts` | Giriş / kayıt akışları |
| `guest-limits.spec.ts` | Misafir kullanım limitleri |
| `pdf-upload.spec.ts` | PDF yükleme |
| `pdf-summarize.spec.ts` | PDF özetleme |
| `pdf-merge.spec.ts` | PDF birleştirme |
| `pdf-chat.spec.ts` | PDF sohbeti |
| `profile.spec.ts` | Profil sayfası |

---

### Tüm testleri tek script ile (Docker)

Servisler **Docker ile çalışıyorsa** (ör. `docker compose up -d`), proje kökünden:

```bash
./scripts/run-tests.sh          # Backend + AI Service + Frontend
./scripts/run-tests.sh backend  # Sadece backend
./scripts/run-tests.sh aiservice # Sadece AI service
./scripts/run-tests.sh frontend  # Sadece frontend
```

Çıktılar zaman damgalı bir dosyaya da yazılır: `test-results-YYYYMMDD-HHMMSS.txt`.

---

## ✨ Özellikler

### 📄 PDF araçları

| Özellik | Açıklama | Sayfa / Alan |
|---------|----------|-------------|
| Özetleme | PDF’i AI ile özetleme, metin + isteğe bağlı seslendirme (TTS) | `/summarize-pdf` |
| Chat | PDF içeriği üzerinde RAG tabanlı soru-cevap (yerel veya bulut LLM); **Global ProChat** (tek FAB, tüm sayfalarda); **Dinamik PDF entegrasyonu** (yüklenen PDF otomatik sohbete dahil edilir) | Özetleme sonrası panel / global chat |
| Birleştirme (Merge) | Birden fazla PDF’i tek dosyada birleştirme | `/merge-pdf` |
| Sayfa çıkarma (Extract) | Belirtilen sayfa aralığını yeni PDF olarak çıkarma | `/extract-pdf` |
| Düzenleme (Edit) | Sayfa sırasını sürükle-bırak ile değiştirme | `/edit-pdf` |
| Dönüştürme (Convert) | PDF dönüştürme araçları | `/convert-pdf` |
| Yükleme & panel | PDF yükleme, sürükle-bırak, ortak PDF panelinde kullanım | `/upload` |

### 👤 Kullanıcı & platform

| Özellik | Açıklama |
|---------|----------|
| Kimlik doğrulama | E-posta/şifre + Google OAuth (NextAuth + Backend JWT) |
| Misafir modu | Giriş yapmadan sınırlı kullanım (ör. özetleme limiti, dosya boyutu) |
| Profil | Avatar (yükleme / AI ile oluşturma), istatistikler, LLM tercihi |
| Fiyatlandırma / roller | Abonelik ve kullanım limitleri | `/pricing` |
| Çoklu dil | Arayüz dil seçimi (LanguageSwitcher) |
| Tema | Açık/koyu tema (ThemeToggle) |

### ⚙️ Teknik özet

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind; Global ProChat (PdfContext tabanlı state, navigasyonda korunur)
- **Backend:** FastAPI, JWT, Supabase (auth/DB), Redis
- **AI:** Özetleme (Gemini), yerel LLM (Ollama), RAG (ChromaDB), Celery ile asenkron işler

Daha detaylı mimari: [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md). Chat API: [docs/API_REFERENCE.md](docs/API_REFERENCE.md). Rapor ve log konumları: [docs/reports-and-outputs.md](docs/reports-and-outputs.md).

---

## 📚 Dokümantasyon

| Kaynak | Açıklama |
|--------|----------|
| [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) | Sistem mimarisi, veri akışı, Global ProChat state, RAG |
| [docs/TEST_STRATEGY.md](docs/TEST_STRATEGY.md) | Test stratejisi, final sayılar, Fedora konfigürasyonu |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | Chat endpoint'leri (general/start, chat/start, message) |
| [docs/reports-and-outputs.md](docs/reports-and-outputs.md) | Rapor ve log konumları |
| [docs/docker-auth-and-logging.md](docs/docker-auth-and-logging.md) | Docker auth ve giriş logları |
| [docs/README.md](docs/README.md) | Tüm dokümanlar indeksi |

---

## Lisans ve katkı

Lisans bilgisi proje kökündeki `LICENSE` dosyasında yer alır. Katkılar için issue ve pull request’ler kabul edilir.
