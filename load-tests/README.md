# Yük ve stres testleri (k6)

Bu klasör, **Grafana k6** ile backend üzerinde ölçüm yapılan senaryoları ve çıktıları içerir. Ayrıntılı komutlar: [scripts/README.md](../scripts/README.md).

## Senaryo özeti (`stress.js`)

| Boyut | Açıklama |
|--------|-----------|
| **Hedef uç nokta** | Kimliği doğrulanmış kullanıcı ile `GET /files/chat/sessions` — PostgreSQL bağlantı havuzu (connection pool) ve oturum sorgularının eşzamanlı yük altındaki davranışı gözlemlenir. |
| **Kimlik doğrulama** | `setup()` içinde **tek sefer** `POST /auth/login` ile JWT alınır; her sanal kullanıcı (VU) döngüsünde tekrar login **yapılmaz**. |
| **Rate limit** | `/auth/login` istekleri IP başına dakikada sınırlıdır (`RATE_LIMIT_AUTH_PER_MINUTE`, varsayılan 10). Tekrarlayan login, 429 yanıtlarına yol açacağından senaryo bilinçli olarak login’i yalıtır; yük **sessions** uç noktasına uygulanır. |
| **Yük profili** | Üç aşamalı: 10 s içinde 50 VU’ya rampa → 30 s 50 VU sabit → 10 s kapanış (0 VU). |
| **Döngü** | Her iterasyonda sessions çağrısı, 1 saniye `sleep` ile aralıklıdır. |

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `K6_BASE_URL` | `http://localhost:8000` | Backend taban adresi |
| `K6_E2E_EMAIL` | `pro@test.com` | Stres testi kullanıcı e-postası |
| `K6_E2E_PASSWORD` | `Test1234!` | Parola |

## Çıktılar

| Dosya | Biçim | Not |
|--------|--------|-----|
| `results.ndjson` | NDJSON (satır başına bir JSON nesnesi) | `run_stress_test_json.sh` ile üretilir; k6 ham metrik akışı. |
| `report.html` | HTML | k6 veya harici rapor üretimi (projeye göre). |

Özet: Bu senaryo, **oturum listeleme** ve dolayısıyla **veritabanı havuzu** ile uyumlu davranışı ölçer; **auth rate limit** ile çakışmayı tasarımla önler.
