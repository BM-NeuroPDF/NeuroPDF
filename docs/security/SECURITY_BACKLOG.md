# Security backlog — frontend dependency audits

Bu dosya, `frontend/` için `npm audit` çıktısından gelen ve **upstream (Next.js) düzeltmesi bekleyen** maddeleri izler.

## Güncel: Next.js içinde gömülü PostCSS (npm audit, moderate)

| Öğe | Değer |
|-----|--------|
| Advisory | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) |
| CVE | **CVE-2026-41305** (GitLab/NVD ile eşleşir; npm metinlerinde çoğunlukla GHSA geçer) |
| Etki | PostCSS’in CSS stringify çıktısında kaçmayan `</style>` ile **XSS (CWE-79)** riski; özellikle güvenilmeyen CSS’in `<style>` içine gömüldüğü senaryolar |
| Etkilenen sürüm aralığı (postcss) | `postcss < 8.5.10` |
| Bu repoda tetikleyen paket | `next` → `node_modules/next/node_modules/postcss` (ör. **8.4.31**); projedeki kök `postcss@^8.5.14` **bu nested kopyayı düzeltmez** |
| Upstream düzeltmesi | Next.js: [PR #93288](https://github.com/vercel/next.js/pull/93288) — gömülü postcss **8.5.10**’a yükseltilir; tartışma: [#93234](https://github.com/vercel/next.js/issues/93234) |

### npm audit sayımı (4 moderate)

Tarayıcı aynı **GHSA** için **tek düğüm** (`postcss`) gösterir; çözümleyici bunu `next` üzerinden `next-auth` ve `@sentry/nextjs`’e de **ilettiği** için toplamda **4 moderate** kayıt üretilir. Hepsinin kök nedeni aynıdır.

### `npm audit fix` ( `--force` olmadan)

- `npm audit fix` **genellikle bu sorunu kapatmaz** (Next’in nested postcss’u güncellenmez).
- `npm audit fix --force` çıktısı **yanıltıcı bir “fix”** önerebilir (ör. eski `next@9.3.3`); bu **kabul edilemez** ve breaking geri almadır.

### Upgrade path (major kırmadan — hedef)

1. **Tercih edilen:** `next` için **stable** bir sürüm yayınlandığında `dependencies.postcss` alanının **>= 8.5.10** olduğunu doğrula, ardından aynı major/minor hattında patch yükselt:
   - `npm view next@<hedef> dependencies.postcss`
   - Yerelde: `npm ls postcss` (nested `next/node_modules/postcss` satırına bak).
2. **Geçici / agresif:** Yalnızca doğrulama için `next@canary` hattında postcss 8.5.10’a geçiş görülebilir (ör. incelemede `next@16.3.0-canary.15` için `dependencies.postcss = 8.5.10`). **Production’da canary kullanmak ayrı risk değerlendirmesi gerektirir.**
3. **Risk kabulü:** Next.js ekibi not düşmüştür: postcss çoğunlukla **build-time** yolunda kullanılır; etki, özellikle **güvenilmeyen kaynak kod/CSS ile build** senaryosunda anlamlıdır. Yine de `npm audit` gürültüsü ve politika gereği postcss bump’ı izlenmelidir.

### İzleme checklist (çeyrek veya release öncesi)

- [ ] `cd frontend && npm audit`
- [ ] `npm view next@latest dependencies.postcss` ve kullanılan `next` sürümü
- [ ] Next.js [releases](https://github.com/vercel/next.js/releases) / changelog: “postcss”, “8.5.10”, “GHSA-qx2v-qp2m-jg93”
- [ ] PR [#93288](https://github.com/vercel/next.js/pull/93288) hangi **stable** etiketine girdi?

### Kayıt

| Tarih | Durum |
|-------|--------|
| 2026-05-08 | Kontrol: `next@16.2.6` (`latest`) -> `dependencies.postcss = 8.4.31` (**hala < 8.5.10**). `npm audit` moderate bulgusu kapanmadı; stable hatta upstream bump bekleniyor. |
| 2026-05-08 | Stable `next@15.5.x`/`16.2.x` npm metadata’da `postcss@8.4.31`; nested audit finding devam. `next@canary` (ör. `16.3.0-canary.15`) `postcss@8.5.10` gösteriyor. Risk acceptance notu `frontend/package.json` içinde. |

> TODO(reminder): Bir sonraki stable Next.js release gününde tekrar kontrol et:
> `npm view next@latest dependencies.postcss` ve değer `>= 8.5.10` olunca `next` + `eslint-config-next` patch upgrade PR'ını aç.

- 2026-05-08: next@latest (16.x) kontrol edildi, postcss hâlâ 8.4.31.
  Fix gelmedi. Bir sonraki kontrol: next minor/patch çıkışında.
- 2026-05-08: next@16.2.6 kontrol edildi, postcss hâlâ 8.4.31.
  Upstream fix (PR #93288) stable'a gelmedi. Sonraki kontrol:
  next minor/patch release'inde.