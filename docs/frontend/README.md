# NeuroPDF — Frontend

Next.js (App Router) tabanlı NeuroPDF arayüzü.

---

## Kurulum ve çalıştırma

- Ana kurulum: proje kökündeki [README.md](../../README.md#-kurulum-setup) (Frontend bölümü).
- Bağımlılıklar ve ortam: `frontend/.env.local` (bkz. kök README).

```bash
cd frontend
npm install
npm run dev    # http://localhost:3000
```

---

## Testler

- Genel test rehberi: [README — Test Rehberi](../../README.md#-test-rehberi).
- Frontend test dokümanları: [testing/frontend/](../testing/frontend/) — TEST_README, TEST_SUMMARY, ALL_TEST_CODES, WEBKIT_FIX.

```bash
npm test           # Vitest
npm run test:e2e    # Playwright
```

---

## Diğer dokümanlar

- [Dokümantasyon merkezi](../README.md)
- [Mimari](../architecture/ARCHITECTURE.md)
- [Image Guidelines](./image-guidelines.md)
