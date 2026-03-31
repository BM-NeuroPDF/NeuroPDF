# Docker: Auth Bağlantısı ve Giriş Logları

Bu doküman, Docker ortamında **frontend–backend auth bağlantısı** ve **giriş hatalarının loglarla tespiti** ile ilgili yapılan düzenlemeleri açıklar.

---

## İçindekiler

1. [Docker'da BACKEND_API_URL](#1-dockerda-backend_api_url)
2. [Frontend loglarını görme](#2-frontend-loglarını-görme)
3. [Giriş hatalarında NextAuth logları](#3-giriş-hatalarında-nextauth-logları)
4. [Sorun giderme özeti](#4-sorun-giderme-özeti)

---

## 1. Docker'da BACKEND_API_URL

### Sorun

Frontend konteyneri içinde çalışan **NextAuth** (e-posta/şifre ve Google girişi), backend'e `BACKEND_API_URL` ile istek atar. Bu istekler **sunucu tarafında** (Node.js / Next.js API route) yapılır; yani isteği atan adres **frontend konteynerinin kendisi**dir.

- `.env.local` içinde `BACKEND_API_URL=http://localhost:8000` kullanılırsa, konteyner içinde `localhost` **backend değil**, frontend konteynerinin kendisi olur.
- Sonuç: `fetch` **ECONNREFUSED** hatası verir; giriş (hem e-posta/şifre hem Google) başarısız olur.

### Çözüm

`docker-compose.yml` içinde frontend servisine, Docker ağındaki backend servis adresi verilir:

```yaml
frontend:
  # ...
  env_file:
    - ./frontend/.env.local
  environment:
    BACKEND_API_URL: "http://backend:8000"
```

- **`environment`** ile verilen değer, `env_file` içindeki aynı değişkeni **override** eder.
- Böylece frontend konteyneri backend'e **`http://backend:8000`** üzerinden erişir; giriş istekleri backend'e ulaşır.

### İki URL farkı

| Değişken | Nerede kullanılır | Docker'da örnek değer |
|----------|-------------------|------------------------|
| **NEXT_PUBLIC_API_URL** | Tarayıcıdan (client-side) backend'e istek | `http://localhost:8000` (port host'ta açıksa) |
| **BACKEND_API_URL** | NextAuth'ın sunucu tarafında backend'e istek | `http://backend:8000` (compose'ta tanımlı) |

Tarayıcı `localhost:8000`'e gidebilir; frontend konteyneri ise sadece `backend:8000` ile backend'e erişebilir.

---

## 2. Frontend loglarını görme

Frontend’te kalıcı bir log dosyası yok; loglar **Docker frontend konteynerinin stdout**’una yazılır.

### Komutlar

```bash
# Son 150 satır
docker compose logs frontend --tail=150

# Canlı takip
docker compose logs -f frontend

# Sadece frontend + backend
docker compose logs -f frontend backend
```

Giriş denemelerinden sonra hata varsa bu loglarda **NextAuth** veya **Authorize error** satırları görünür.

---

## 3. Giriş hatalarında NextAuth logları

Backend’e giden istekler başarısız olduğunda, **nedenini** görmek için NextAuth route’larına log satırları eklenmiştir.

### E-posta / şifre girişi

- **Dosya:** `frontend/src/app/api/auth/[...nextauth]/route.ts`
- Backend `POST /auth/login` **4xx/5xx** döndüğünde:
  - Terminalde (Docker’da: `docker compose logs frontend`):
  - `[NextAuth] Backend /auth/login failed: <status> <backend cevabı>`
- Örnek: `401 {"detail":"Invalid credentials"}` → kullanıcı yok veya şifre yanlış.

### Google girişi

- Backend `POST /auth/google` hata döndüğünde:
  - `[NextAuth] Backend /auth/google failed: <status> <backend cevabı>`
- Bağlantı hatası (ECONNREFUSED) ise `fetch failed` + `code: 'ECONNREFUSED'` görünür; bu durumda genelde **BACKEND_API_URL** yanlıştır (Docker’da `http://backend:8000` olmalı).

### Nereye bakılır?

- **Yerel:** `npm run dev` çalıştırdığınız terminal.
- **Docker:** `docker compose logs -f frontend`.

---

## 4. Sorun giderme özeti

| Belirti | Olası neden | Kontrol |
|--------|-------------|--------|
| `fetch failed` / `ECONNREFUSED` (frontend loglarında) | Frontend konteyneri backend'e ulaşamıyor | `docker-compose.yml` içinde `BACKEND_API_URL: "http://backend:8000"` tanımlı mı? |
| `POST /auth/login` veya `POST /auth/google` backend loglarında yok | İstek backend'e hiç gitmiyor | Aynı şekilde BACKEND_API_URL (Docker’da `backend:8000`) |
| `[NextAuth] Backend /auth/login failed: 401` | Backend "Invalid credentials" | Kullanıcı kayıtlı mı? Şifre doğru mu? |
| Tarayıcıda `api/auth/callback/credentials 401` | NextAuth girişi reddetti | Frontend/Docker frontend loglarına bakın; backend cevabı orada loglanır |

Değişiklik sonrası frontend’i yeniden başlatmak gerekebilir:

```bash
docker compose up -d frontend
# veya
docker compose restart frontend
```

---

**İlgili dosyalar**

- `docker-compose.yml` — frontend servisi `environment.BACKEND_API_URL`
- `frontend/src/app/api/auth/[...nextauth]/route.ts` — authorize ve JWT callback + hata logları
- [README.md](../../README.md) — Genel kurulum ve Docker bölümü
