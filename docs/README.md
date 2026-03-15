# NeuroPDF — Dokümantasyon Merkezi

Tüm proje dokümanları tek bir yapıda toplanmıştır. Ana README ve kurulum için proje kökündeki [README.md](../README.md) dosyasına bakın.

---

## İçindekiler

| Kategori | Açıklama | Konum |
|----------|----------|--------|
| **Frontend** | Kurulum, çalıştırma, test komutları | [frontend/](frontend/README.md) |
| **Mimari** | Sistem mimarisi, veri akışı, güvenlik | [architecture/](architecture/) |
| **Testler** | Test raporları, backend/frontend test rehberleri | [testing/](testing/) |
| **Yasal** | EULA ve yasal metinlere referans | [legal/](legal/) |
| **Raporlar & Çıktılar** | Log ve coverage raporlarının konumları | [reports-and-outputs.md](reports-and-outputs.md) |
| **Test scriptleri** | Tüm test scriptlerinin kullanımı (Docker + yerel) | [TEST_SCRIPTS.md](TEST_SCRIPTS.md) |
| **Docker Auth & Logging** | Docker'da BACKEND_API_URL, frontend logları, giriş hata logları | [docker-auth-and-logging.md](docker-auth-and-logging.md) |
| **Test stratejisi** | Final sayılar (27 E2E, 128 unit, 41 integration), Fedora konfigürasyonu | [TEST_STRATEGY.md](TEST_STRATEGY.md) |
| **API referansı** | Chat endpoint'leri (general/start, chat/start, message) | [API_REFERENCE.md](API_REFERENCE.md) |
| **.md Dosyaları Rehberi** | Projedeki tüm Markdown dosyalarının listesi ve açıklaması | [MARKDOWN_FILES.md](MARKDOWN_FILES.md) |

---

### Frontend

- **[frontend/README.md](frontend/README.md)** — Frontend kurulumu, çalıştırma ve test; test dokümanlarına linkler.

---

### Mimari

- **[ARCHITECTURE.md](architecture/ARCHITECTURE.md)** — Sistem genel bakış, bileşenler, veri akışı, veritabanı şeması, AI pipeline, kimlik doğrulama, güvenlik ve deployment.

---

### Test dokümantasyonu

- **[testing/](testing/)** — Tüm test raporları ve rehberler:
  - Kapsamlı test raporu, test implementasyon raporu, birim test raporu, güvenlik iyileştirmeleri
  - Backend test mimarisi ve çalıştırma
  - Frontend test yapısı, E2E, Vitest, Playwright, WebKit notları

---

### Yasal

- **[legal/README.md](legal/README.md)** — EULA metinlerinin nerede tutulduğu ve nasıl kullanıldığı.

---

### Raporlar ve çıktılar

- **[reports-and-outputs.md](reports-and-outputs.md)** — Test ve coverage çıktılarının, log dosyalarının ve rapor dizinlerinin konumları.
