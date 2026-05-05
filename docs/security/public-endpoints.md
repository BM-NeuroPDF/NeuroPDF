# Public Endpoint Abuse Matrix

Bu dokuman backend public endpoint'leri icin auth durumu, mevcut koruma ve uygulanan rate-limit stratejisini kaydeder.

| Path | Method | Auth | Rate-limit | Ek limitler | Abuse senaryosu |
|---|---|---|---|---|---|
| `/files/summarize-guest` | `POST` | Public (`X-Guest-ID` opsiyonel) | IP: `2 rps`, `20 rpm`; Global: `300 rpm` | `MAX_SUMMARIZE_GUEST_BYTES=5MB`, dosya tipi PDF | Bot ile pahali LLM cagrisi flood, buyuk payload ile kaynak tuketimi |
| `/files/markdown-to-pdf` | `POST` | Public | IP: `3 rps`, `45 rpm`; Global: `600 rpm` | `MAX_MARKDOWN_TO_PDF_BYTES=100KB` | CPU agir PDF render flood, buyuk markdown ile memory baskisi |
| `/files/global-stats` | `GET` | Public | IP: `10 rps`, `180 rpm`; Global: `2400 rpm` | Cache-first cevap | Scraping / enumeration ile read-amplification |
| `/files/callback/{pdf_id}` | `POST` | Public path, secret+signature zorunlu | IP: `5 rps`, `120 rpm`; Global: `1200 rpm` | `X-Callback-Secret`, `X-Callback-Timestamp`, `X-Callback-Signature`, replay guard, opsiyonel CIDR allowlist | Forged callback, replay attack, callback endpoint brute force |
| `/guest/session` | `POST` | Public | IP: `2 rps`, `20 rpm`; Global: `200 rpm` | 24 saat guest session TTL | Session-id spam, Redis key flood |
| `/guest/check-usage` | `GET` | Public (`X-Guest-ID`) | IP: `8 rps`, `180 rpm`; Global: `3000 rpm` | Guest usage sayaci | Guessing/probing ile read flood |
| `/guest/use` | `POST` | Public (`X-Guest-ID`) | IP: `3 rps`, `60 rpm`; Guest-ID: `30 rpm`; Global: `1000 rpm` | `MAX_GUEST_USAGE` kontrolu | Guest quota brute force, counter abuse |
| `/guest/session` | `DELETE` | Public (`X-Guest-ID`) | IP: `5 rps`, `120 rpm`; Global: `1200 rpm` | Guest key silme | Session churn / delete flood |

## Callback Security Notes

- Signature formati: `HMAC_SHA256(secret, "<timestamp>.<raw-json-body>")`
- Replay korumasi: imza `CALLBACK_MAX_SKEW_SECONDS` penceresinde Redis `NX` key ile tek-kullanim.
- `CALLBACK_ALLOWED_CIDRS` bos degilse callback sadece bu CIDR araliklarindan kabul edilir.
- Rate-limit asiminda tum endpoint'ler `429` ve `Retry-After` header doner.
