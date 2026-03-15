# Projedeki Markdown (.md) Dosyaları Rehberi

Bu doküman, NeuroPDF projesindeki tüm Markdown dosyalarının konumunu, amacını ve ne zaman kullanılacağını listeler.

---

## Kök dizin

| Dosya | Açıklama | Ne zaman kullanılır |
|-------|----------|---------------------|
| **README.md** | Projenin ana giriş dokümanı. Kurulum (Frontend, Backend, AI Service), Docker, Test Rehberi ve Özellikler özetlenir. | Yeni geliştiriciler, kurulum, test komutları ve genel bakış için ilk bakılacak dosya. |

---

## Frontend dizini (`frontend/`)

| Dosya | Açıklama | Ne zaman kullanılır |
|-------|----------|---------------------|
| **README.md** | Yönlendirme: tüm frontend dokümanları `docs/frontend/` ve `docs/testing/frontend/` altında. | Frontend klasörüne girince nereye bakılacağını görmek için. |

---

## Backend dizini (`backend/`)

| Dosya | Açıklama | Ne zaman kullanılır |
|-------|----------|---------------------|
| **tests/README.md** | Kısa yönlendirme. Asıl rehber: `docs/testing/backend-tests.md`. | Backend test mimarisi, pytest kategorileri ve çalıştırma için. |
| **app/docs/EULA_TR.md** | Kullanıcı sözleşmesi (Türkçe). Kayıt akışında gösterilir; uygulama tarafından okunur. | **Taşınmamalı.** Yasal metin güncellemesi yapılırken. |
| **app/docs/EULA_EN.md** | Kullanıcı sözleşmesi (İngilizce). Kayıt akışında gösterilir; uygulama tarafından okunur. | **Taşınmamalı.** Yasal metin güncellemesi yapılırken. |

---

## Dokümantasyon merkezi (`docs/`)

### Genel

| Dosya | Açıklama | Ne zaman kullanılır |
|-------|----------|---------------------|
| **README.md** | Dokümantasyon indeksi: frontend, mimari, test, yasal, raporlar. | Tüm dokümanların nerede olduğunu görmek için. |
| **reports-and-outputs.md** | Test/coverage çıktılarının ve log dosyalarının konumları. | Coverage, Playwright raporu, test logları nerede diye bakarken. |
| **TEST_SCRIPTS.md** | Test scriptleri rehberi: Docker ve yerel komutlar, kullanım. | Hangi scripti nasıl çalıştıracağını görmek için. |
| **MARKDOWN_FILES.md** | Bu dosya — projedeki tüm .md dosyalarının listesi ve açıklaması. | Hangi .md’nin ne işe yaradığını bulmak için. |

### Frontend (tek konum)

| Dosya | Açıklama | Ne zaman kullanılır |
|-------|----------|---------------------|
| **frontend/README.md** | Frontend kurulumu, çalıştırma, test komutları; test dokümanlarına linkler. | Frontend ile ilgili her şey tek yerden. |

### Mimari

| Dosya | Açıklama | Ne zaman kullanılır |
|-------|----------|---------------------|
| **architecture/ARCHITECTURE.md** | Sistem mimarisi: bileşenler, veri akışı, veritabanı, AI pipeline, güvenlik, deployment. | Mimari karar, onboarding veya deployment planlarken. |

### Yasal

| Dosya | Açıklama | Ne zaman kullanılır |
|-------|----------|---------------------|
| **legal/README.md** | EULA dosyalarının konumu (`backend/app/docs/`) ve kullanımı. | EULA’nın nerede ve nasıl kullanıldığını anlamak için. |

### Test dokümantasyonu (`docs/testing/`)

| Dosya | Açıklama | Ne zaman kullanılır |
|-------|----------|---------------------|
| **README.md** | Test dokümanları indeksi: raporlar ve frontend/backend rehberleri. | Test ile ilgili hangi dokümana gideceğini seçerken. |
| **backend-tests.md** | Backend test mimarisi, klasör yapısı, pytest marker’ları, fixtures, çalıştırma. | Backend testi yazarken veya çalıştırırken. |
| **COMPREHENSIVE_TEST_REPORT.md** | Kapsamlı test raporu: istatistikler, kapsam, kategoriler. | Test durumunun genel özeti için. |
| **TEST_IMPLEMENTATION_REPORT.md** | Test implementasyon raporu. | Testlerin nasıl uygulandığını incelemek için. |
| **UNIT_TEST_REPORT.md** | Birim test raporu. | Unit test kapsamı ve sonuçları için. |
| **SECURITY_IMPROVEMENTS_REPORT.md** | Güvenlik iyileştirmeleri raporu. | Güvenlik testleri ve iyileştirmeler için. |

### Frontend test (`docs/testing/frontend/`)

| Dosya | Açıklama | Ne zaman kullanılır |
|-------|----------|---------------------|
| **TEST_README.md** | Frontend test yapısı, klasörler, Vitest/Playwright kullanımı. | Frontend testleri yazıp çalıştırırken. |
| **TEST_SUMMARY.md** | Frontend test özeti, tamamlanan işlemler, dosya istatistikleri. | Test durumu özeti için. |
| **ALL_TEST_CODES.md** | Tüm frontend test kodlarının tek dosyada referans listesi. | Test kodlarına hızlı referans için. |
| **WEBKIT_FIX.md** | WebKit (Safari) E2E test ortamı: libjpeg sembolik link ve alternatif çözüm. | Playwright WebKit testleri çalışmıyorsa. |

---

## Özet akış

```
Projeye ilk giriş        → README.md (kök)
Kurulum / Docker / Test  → README.md (kök) ilgili bölümler
Tüm dokümanlar nerede?   → docs/README.md
Frontend dokümanı        → docs/frontend/README.md
Hangi .md ne işe yarar?  → docs/MARKDOWN_FILES.md (bu dosya)
Mimari detay             → docs/architecture/ARCHITECTURE.md
Test raporları / rehber  → docs/testing/README.md ve altı
EULA / yasal             → docs/legal/README.md + backend/app/docs/EULA_*.md
Rapor/log konumları      → docs/reports-and-outputs.md
Test scriptleri          → docs/TEST_SCRIPTS.md
```
