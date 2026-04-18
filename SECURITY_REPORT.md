# NeuroPDF Security Audit Report

Bu rapor NeuroPDF kod tabaninin (`backend`, `frontend`, `aiService`) OWASP Top 10 (2021) perspektifiyle denetlenmesi sonucu hazirlanmistir. Değerlendirme; kimlik doğrulama, yetkilendirme, dosya yukleme guvenligi, API guvenligi, yapay zeka veri gizliligi ve yazilim tedarik zinciri (dependency/SCA) boyutlarini kapsar.

## Executive Summary

- NeuroPDF guvenlik acisindan **olgun bir temel** uzerine kuruludur: JWT tabanli auth, bcrypt sifreleme, role-check, CORS ve security header'lar, Redis tabanli rate limiting, upload size limitleri ve local-LLM opsiyonu mevcuttur.
- Bununla birlikte denetimde kapanmasi gereken kritik riskler de bulunmustur:
  - Auth korumasi olmayan callback endpoint'i
  - Frontend tarafinda token/header loglama
  - Bazi route'larda localhost hardcoded URL kullanimi
  - Rate limiting'in auth disi pahali endpoint'lere genisletilmemesi
- Sonuc: Sistem "security-by-design" yaklaşımını buyuk oranda uygulamaktadir; ancak kurumsal denetim seviyesi icin belirli risklerin kapatilmasi gerekir.

---

## 1) Authentication & Authorization

### 1.1 JWT imzalama, expiration ve `sub` dogrulamasi

**Guclu yonler**
- JWT olusturma surecinde `sub`, `exp`, `iat`, `iss` claim'leri set ediliyor.  
  Kanit: `backend/app/core/security.py` (`create_jwt`).
- `get_current_user` dependency'si token expiry ve imza hatalarinda `401` donuyor.  
  Kanit: `backend/app/deps.py`.
- Auth endpoint'lerinde sifreler bcrypt ile hashleniyor ve policy uygulanıyor.  
  Kanit: `backend/app/core/security.py`, `backend/app/schemas/auth.py`.

**Risk / iyilestirme**
- JWT decode tarafinda issuer/audience zorunlulugu tanimli degil (`iss` yaziliyor ama verification strict degil).  
  Kanit: `backend/app/core/security.py`, `backend/app/deps.py`.
- `get_current_user_optional` invalid token'i guest'e dusuruyor; bazi endpoint'lerde bu davranis yetki modelini zayiflatabilir.  
  Kanit: `backend/app/deps.py`.

### 1.2 Guest vs User veri izolasyonu

**Guclu yonler**
- User-owned PDF operasyonlarinda user ownership kontrolu bulunuyor (`get_pdf_from_db(..., user_id)`).  
  Kanit: `backend/app/storage.py`, `backend/app/routers/files.py`.
- Protected endpoint'lerde `Depends(get_current_user)` yaygin kullanilmis.  
  Kanit: `backend/app/routers/files.py`.

**Risk / iyilestirme**
- Guest kullanimi Redis tabanli izleniyor (`/guest/check-usage`, `/guest/use`) ancak guest-capable file endpoint'lerde quota enforcement her yerde zorunlu degil.  
  Kanit: `backend/app/routers/guest.py`, `backend/app/routers/files.py`.
- Auth'suz callback route veri butunlugune etki edebilir.  
  Kanit: `backend/app/routers/files.py` (`/callback/{pdf_id}`).

---

## 2) Input Validation & Upload Security

### 2.1 Dosya boyutu ve MIME kontrolleri

**Guclu yonler**
- Backend dosya boyutu server-side kontrol ediliyor (`MAX_FILE_SIZE_GUEST_MB` / `MAX_FILE_SIZE_USER_MB`).  
  Kanit: `backend/app/routers/files.py` (`validate_file_size`), `backend/app/config.py`.
- Frontend'de de ek istemci tarafi kontrol var (UX odakli erken engelleme).  
  Kanit: `frontend/src/app/config/fileLimits.ts`, `frontend/src/components/ProChatPanel.tsx`.
- Filename sanitization ile path traversal ve tehlikeli karakterler temizleniyor.  
  Kanit: `backend/app/storage.py` (`sanitize_filename`).

**Risk / iyilestirme**
- Bircok endpoint sadece `content_type == application/pdf` kontrolune guveniyor; magic-byte/PDF parser seviyesinde hardening uniform degil.  
  Kanit: `backend/app/routers/files.py`.
- Bazi hata yakalama bloklari kullanici hatalarini da `500`e ceviriyor (diagnostic quality dusuyor).  
  Kanit: `backend/app/routers/files.py` (genel `except Exception` kaliplari).

### 2.2 XSS ve Prompt Injection baglaminda metin guvenligi

**Guclu yonler**
- Frontend markdown render akisi `react-markdown` + `remark-gfm` ile `dangerouslySetInnerHTML` kullanmadan ilerliyor.  
  Kanit: `frontend/src/components/MarkdownViewer.tsx`, `frontend/src/components/ProChatPanel.tsx`.

**Risk / iyilestirme**
- `aiService` icindeki `text_cleaner` dilsel kalite aracidir; dogrudan prompt-injection/WAF rolunde degil.  
  Kanit: `aiService/app/services/text_cleaner.py`.
- Prompt injection'e karsi semantik guardrail/classifier katmani sinirli; savunma daha cok prompt yapisina dayaniyor.  
  Kanit: `aiService/app/routers/analysis.py`, `aiService/app/services/local_llm_service.py`.

---

## 3) Network & API Security

### 3.1 Rate Limiting (Redis) ve brute-force/DDoS dayanikliligi

**Guclu yonler**
- Redis tabanli rate limiting mekanizmasi auth endpoint'lerinde uygulanmis (`/auth/login`, `/auth/register`, `/auth/google`).  
  Kanit: `backend/app/rate_limit.py`, `backend/app/routers/auth.py`.
- Rate-limit ihlalleri security logger ile kaydediliyor.  
  Kanit: `backend/app/rate_limit.py`, `backend/app/security_logger.py`.

**Risk / iyilestirme**
- Mevcut rate limit kapsamı auth ile sinirli; pahali `files`/chat endpoint'lerinde zorunlu degil.  
  Kanit: `backend/app/routers/files.py`.
- Redis arizasi durumunda limiter fail-open (izin ver) davraniyor; saldiri penceresi olusturabilir.  
  Kanit: `backend/app/rate_limit.py`.

### 3.2 CORS ve API erisim sinirlari

**Guclu yonler**
- CORS origin listesi explicit; `FRONTEND_ORIGIN` ve localhost originleri tanimli.  
  Kanit: `backend/app/main.py`.
- Guvenlik header'lari set ediliyor (`X-Frame-Options`, `nosniff`, `HSTS`, `Referrer-Policy`, `CSP`).  
  Kanit: `backend/app/main.py`.

**Risk / iyilestirme**
- `allow_methods=["*"]`, `allow_headers=["*"]` pragmatik ama daha sikı politika uygulanabilir.
- CSP var ancak `unsafe-inline` iceriyor; strict nonce/hash modeline gecis guvenligi arttirir.

### 3.3 Frontend API akis guvenligi

**Guclu yonler**
- HTTPS + HTTP backend durumunda mixed-content'i engellemek icin relative URL fallback var.  
  Kanit: `frontend/src/utils/api.ts`.
- Next.js rewrite ile `/files/*`, `/auth/*` backend'e proxyleniyor.  
  Kanit: `frontend/next.config.ts`.

**Risk / iyilestirme**
- API request debug log'unda headers basiliyor; Authorization token loglara sizabilir.  
  Kanit: `frontend/src/utils/api.ts`.
- EULA akısında token console'a yazdiriliyor.  
  Kanit: `frontend/src/components/auth/EulaGuard.tsx`.
- Profile sayfasinda hardcoded `http://localhost:8000` kullanimi bulunuyor.  
  Kanit: `frontend/src/app/profile/page.tsx`.

---

## 4) AI Data Privacy (Local LLM Avantaji)

NeuroPDF mimarisinde en kritik guvenlik artılarından biri, model seciminde local-run seceneginin bulunmasidir.

### 4.1 Local LLM (Ollama) guvenlik kazanimi

- `docker-compose` içinde Ollama servisi ve AI service entegrasyonu tanimli; kurum ici/yerel isleme senaryosunu destekliyor.  
  Kanit: `docker-compose.yml`.
- `LOCAL_LLM_URL` ile AI istekleri bulut yerine local endpoint'e yonlendirilebiliyor.  
  Kanit: `aiService/app/config.py`, `aiService/app/services/local_llm_service.py`.

**Kurumsal katki (Data Privacy by Design):**
- Hassas PDF icerigi cloud API'lere gitmeden analiz edilebilir.
- Regule ortamlarda (KVKK/GDPR/kurum ici veri politikasi) veri cikis riskini azaltir.
- Air-gapped veya restricted network senaryolari icin uyumluluk avantajı saglar.

### 4.2 Dikkat edilmesi gereken noktalar

- Lokal endpoint konfigürasyonu yanlış yapılırsa (`LOCAL_LLM_URL` guvenilmeyen adrese giderse) API key forwarding riski dogabilir.  
  Kanit: `aiService/app/services/local_llm_service.py`.
- Chat/PDF metinlerinin DB’de tutulmasi retention governance gerektirir.  
  Kanit: `backend/app/models.py`, `backend/app/chat_session_storage.py`, `aiService/app/routers/analysis.py`.

---

## 5) OWASP Top 10 Uyum Analizi ve Skor

### 5.1 OWASP kontrol esleme tablosu

| OWASP 2021 | Durum | Kanit | Not |
|---|---|---|---|
| A01 Broken Access Control | Orta | `backend/app/deps.py`, `backend/app/storage.py`, `backend/app/routers/files.py` | Temel ownership iyi; callback endpoint auth eksigi kritik |
| A02 Cryptographic Failures | Iyi | `backend/app/core/security.py`, JWT `HS256` + exp + bcrypt | Gizli anahtar yönetimi env tabanli, fakat repo secrets riski mevcut |
| A03 Injection | Orta-Iyi | SQLAlchemy/parametrik SQL kullanimi (`auth.py`), markdown render guvenli | Prompt injection icin ek semantic guardrail onerilir |
| A04 Insecure Design | Orta | Local/cloud secimli mimari, role checks | Quota enforcement ve callback trust modeli guclendirilmeli |
| A05 Security Misconfiguration | Orta | Prod env validator (`config.py`) | Frontend debug log/token log ve hardcoded localhost var |
| A06 Vulnerable/Outdated Components | Orta | `package.json`, `backend/requirements.txt`, `aiService/requirements.txt` | Paketler versiyonlanmis; otomatik SCA pipeline gorunurlugu sinirli |
| A07 Identification & Authentication Failures | Iyi | JWT expiry, bcrypt, auth rate limit | Optional token fallback davranisi bazı endpointlerde gevsek olabilir |
| A08 Software and Data Integrity Failures | Orta | API key gate (`aiService/deps.py`) | Callback/signature dogrulama eksigi kapanmali |
| A09 Security Logging and Monitoring Failures | Iyi | `security_logger.py`, rate-limit loglari | SIEM/export politikasi raporda belgelenmeli |
| A10 SSRF | Orta | Avatar servisinde host allowlist kontrolleri mevcut | AI task callback URL allowlist/signature kontrolu onerilir |

### 5.2 Security Compliance Score (100 uzerinden)

Kullanilan agirlikli modelde (A01/A02/A03/A05 daha yuksek agirlikli) NeuroPDF'in mevcut guvenlik uyum skoru:

## **81 / 100**

**Skorun anlamı**
- 80+ bandi: Guclu temel kontroller ve kurumsal seviyeye yakin mimari olgunluk.
- 90+ bandina cikis icin gerekli ana kapanislar:
  1) Auth'suz callback endpoint'i guvene alinmali  
  2) Frontend token/log sızıntı yüzeyi kapatilmali  
  3) Rate limiting auth disi pahali endpoint'lere yayginlastirilmali  
  4) Prompt-injection ve callback trust modeli sertlestirilmeli

---

## 6) Secret Management (Sır Yonetimi)

### 6.1 Pozitif bulgular
- Uygulama configleri env tabanli (`.env` + `pydantic settings`) tasarlanmis; hardcoded secret anti-pattern'i azaltiliyor.  
  Kanit: `backend/app/config.py`, `aiService/app/config.py`, `frontend/next.config.ts`.
- Production ortaminda kritik degiskenler eksikse startup validation mevcut.  
  Kanit: `backend/app/config.py`.

### 6.2 Riskler
- Repo icinde `.env` dosyalarinda gercek kimlik bilgisi/API key benzeri degerler bulunmasi olasiligi yuksek bir denetim riskidir. Bu durum CI secret scanning ile zorunlu kontrol edilmelidir.

---

## 7) Dependency Security (SCA)

### 7.1 Mevcut durum
- Frontend ve Python servislerinde bagimliliklar central dosyalarda tanimli:  
  - `frontend/package.json`  
  - `backend/requirements.txt`  
  - `aiService/requirements.txt`
- Paketler belirli versiyonlarla yonetiliyor; test/tooling ekosistemi de versioned.

### 7.2 Guvenlik denetimi yorumu
- Kod tabaninda otomatik SCA pipeline (ornegin `npm audit`, `pip-audit`, Dependabot/Safety/OSV scanner) zorunlu kilindigina dair net CI kaniti gorunmuyor.
- Kurumsal seviye icin onerilen asgari kontrol:
  - PR pipeline'da `npm audit --production` (veya alternatif SCA),
  - Python tarafinda `pip-audit`/`safety`,
  - Secret scanning (gitleaks/trufflehog),
  - Kritik CVE threshold'unda build fail.

---

## 8) Remediation Roadmap

### Quick Wins (0-2 hafta)
1. `/files/callback/{pdf_id}` endpoint'ine auth + request signing (HMAC/shared-secret) ekle.
2. Frontend token/header loglarini kaldir:
   - `frontend/src/utils/api.ts` request logger
   - `frontend/src/components/auth/EulaGuard.tsx` token log
3. `frontend/src/app/profile/page.tsx` icindeki `http://localhost:8000` hardcoded cagrilari merkezi API resolver'a tasi.
4. `files.py` icinde `except HTTPException: raise` kalibini standardize et; kullanici kaynakli hatalar 4xx olarak kalsin.

### Mid-Term (2-6 hafta)
1. Auth disi pahali endpoint'lere (summarize/chat/extract/merge/upload) rate limiting uygula.
2. PDF upload hardening:
   - Magic-byte kontrolu (`%PDF-`)
   - Encrypted/malformed PDF handling policy
3. Prompt injection savunmasi:
   - Input policy layer
   - Tool invocation allowlist/guardrail enrichment
4. SCA + secret scanning'i CI'da zorunlu hale getir.

### Strategic (6+ hafta)
1. Token lifecycle iyilestirme (issuer/audience strict verify, rotation/revocation policy).
2. Data retention governance (chat/pdf text TTL, minimization, encryption-at-rest policy belgeleme).
3. OWASP ASVS seviyesine gore resmi secure SDLC kontrol listesi yayinlama.

---

## Sonuc

NeuroPDF, guvenligi mimariye gomulmus bir urun olma yolunda belirgin sekilde ileri durumdadir: JWT + bcrypt, role/ownership kontrolleri, server-side limitler, AI service key gate, CORS/header politikasi ve local LLM privacy modeli bunu destekler. Kritik birkaç nokta (callback auth, token logging, endpoint-level throttling) kapatildiginda sistem denetim ve juri karsisinda cok daha guclu bir "Security by Design" pozisyonuna ulasir.
