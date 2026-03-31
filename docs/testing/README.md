# Test dokümantasyonu

Bu klasör test stratejisi, script rehberi, raporlar ve alt rehberleri içerir.

---

## Strateji ve scriptler

| Dosya | Açıklama |
|-------|----------|
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | Final sayılar, Vitest/Pytest/Playwright yapılandırması, Fedora notları |
| [TEST_SCRIPTS.md](TEST_SCRIPTS.md) | `scripts/` altındaki test komutları (Docker + yerel) |

---

## Raporlar (Markdown)

Arşiv niteliğindeki raporlar `reports/` altında toplanmıştır.

| Dosya | Açıklama |
|-------|----------|
| [reports/COMPREHENSIVE_TEST_REPORT.md](reports/COMPREHENSIVE_TEST_REPORT.md) | Kapsamlı test raporu — istatistikler, kapsam, kategoriler |
| [reports/TEST_IMPLEMENTATION_REPORT.md](reports/TEST_IMPLEMENTATION_REPORT.md) | Test implementasyon raporu |
| [reports/UNIT_TEST_REPORT.md](reports/UNIT_TEST_REPORT.md) | Birim test raporu |
| [reports/SECURITY_IMPROVEMENTS_REPORT.md](reports/SECURITY_IMPROVEMENTS_REPORT.md) | Güvenlik iyileştirmeleri raporu |

---

## Rehberler

| Dosya | Açıklama |
|-------|----------|
| [backend-tests.md](backend-tests.md) | Backend test mimarisi, pytest kategorileri, fixtures, çalıştırma |
| [frontend/](frontend/) | Frontend test dokümanları |

### Frontend alt klasörü

| Dosya | Açıklama |
|-------|----------|
| [frontend/TEST_README.md](frontend/TEST_README.md) | Frontend test yapısı ve kullanım |
| [frontend/TEST_SUMMARY.md](frontend/TEST_SUMMARY.md) | Frontend test özet raporu |
| [frontend/ALL_TEST_CODES.md](frontend/ALL_TEST_CODES.md) | Tüm frontend test kodları (referans) |
| [frontend/WEBKIT_FIX.md](frontend/WEBKIT_FIX.md) | WebKit (Safari) E2E test ortamı düzeltmesi |

Testlerin nasıl çalıştırılacağı için proje kökündeki [README.md](../../README.md#test-rehberi) bölümüne bakın.
