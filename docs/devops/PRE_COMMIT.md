# Pre-commit hooks (Husky + lint-staged)

Kök dizinde `npm install` çalıştırdığınızda `prepare` script’i Husky’yi kurar ve `.husky/pre-commit` her `git commit` öncesinde **`npx lint-staged`** çalıştırır.

## Ne yapılır?

| Staged dosyalar | İşlem |
|-----------------|--------|
| `frontend/**/*.{js,jsx,ts,tsx}` | `frontend` içinde `eslint --fix`, ardından kökten `prettier --write` |
| `frontend/**/*.{css,json}` | `prettier --write` |
| `backend/**/*.py`, `aiService/**/*.py` | `python -m ruff check --fix`, `python -m ruff format` |

Yapılandırma: [`.lintstagedrc.mjs`](../../.lintstagedrc.mjs), [`.prettierrc`](../../.prettierrc), [`ruff.toml`](../../ruff.toml).

## Ruff çalıştırma notu (güncel)

`npx ruff` bazı ortamlarda binary çözümleme hatası verebildiği için pre-commit/lint aşamasında Ruff komutları artık Python modülü olarak çağrılmalıdır:

- `python -m ruff check .`
- `python -m ruff format .`

> Gereksinim: Ortamda Ruff'ın pip ile kurulu olması gerekir (`python -m pip install ruff`).

## İlk kurulum

```bash
cd /path/to/NeuroPDF
npm install
```

Hook’u atlamak için (nadiren): `HUSKY=0 git commit ...` veya `git commit --no-verify`.

## CI ile ilişki

Bu hook’lar yalnızca **yerel commit** sırasında çalışır. GitHub Actions veya başka CI’da ayrıca `eslint` / `prettier` / `ruff` adımları tanımlanmalıdır (şu an zorunlu değil).

## İlk açılış notu

Projede çok sayıda birikmiş stil ihlali varsa, tek seferlik tam format için:

```bash
cd frontend && npx eslint . --fix && npx prettier --write "src/**/*.{ts,tsx,js,jsx,css,json}"
cd ../backend && python -m ruff check --fix . && python -m ruff format .
cd ../aiService && python -m ruff check --fix . && python -m ruff format .
```
