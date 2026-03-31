# NeuroPDF — Dokümantasyon merkezi

Tüm proje dokümanları bu ağaç altında toplanır. Kurulum ve ürün özeti için kök [README.md](../README.md) dosyasına bakın.

---

## Klasör yapısı (özet)

| Klasör / dosya | İçerik |
|----------------|--------|
| **[architecture/](architecture/)** | Sistem mimarisi, Mermaid diyagramları, tool routing |
| **[devops/](devops/)** | CI/CD (GitHub Actions), pre-commit (Husky), Docker auth ve loglama |
| **[reference/](reference/)** | API referansı, rapor/coverage çıktı konumları |
| **[testing/](testing/)** | Test stratejisi, script rehberi, `reports/` altında arşiv raporlar, backend/frontend rehberleri |
| **[frontend/](frontend/)** | Frontend kurulum ve çalıştırma notları |
| **[legal/](legal/)** | EULA ve yasal metinlere referans |
| **[assets/](assets/)** | Demo GIF vb. statik varlıklar (ör. `demo.gif`) |

Kök `docs/` altında yalnızca bu indeks ve [MARKDOWN_FILES.md](MARKDOWN_FILES.md) (tüm `.md` envanteri) bulunur; teknik belgeler yukarıdaki alt klasörlerde gruplanmıştır.

---

## Hızlı bağlantılar

| Konu | Belge |
|------|--------|
| Mimari | [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md) |
| Chat / dosya API | [reference/API_REFERENCE.md](reference/API_REFERENCE.md) |
| Coverage & log dizinleri | [reference/reports-and-outputs.md](reference/reports-and-outputs.md) |
| Test stratejisi ve sayılar | [testing/TEST_STRATEGY.md](testing/TEST_STRATEGY.md) |
| Test script komutları | [testing/TEST_SCRIPTS.md](testing/TEST_SCRIPTS.md) |
| GitHub Actions | [devops/CI.md](devops/CI.md) |
| Husky / lint-staged | [devops/PRE_COMMIT.md](devops/PRE_COMMIT.md) |
| Docker’da auth ve loglar | [devops/docker-auth-and-logging.md](devops/docker-auth-and-logging.md) |
| Tüm `.md` dosya rehberi | [MARKDOWN_FILES.md](MARKDOWN_FILES.md) |

---

### Frontend

- [frontend/README.md](frontend/README.md) — Kurulum, çalıştırma, teste giriş.

### Mimari

- [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md) — Bileşenler, veri akışı, ajan ve araç yönlendirmesi.

### Test ağacı

- [testing/README.md](testing/README.md) — Raporlar, rehberler ve `reports/` indeksi.

### Yasal

- [legal/README.md](legal/README.md) — EULA dosya konumları.
