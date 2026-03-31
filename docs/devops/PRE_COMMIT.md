# Pre-commit hooks (Husky + lint-staged)

Kök dizinde `npm install` çalıştırdığınızda `prepare` script’i Husky’yi kurar ve `.husky/pre-commit` her `git commit` öncesinde **`npx lint-staged`** çalıştırır.

## Ne yapılır?

| Staged dosyalar | İşlem |
|-----------------|--------|
| `frontend/**/*.{js,jsx,ts,tsx}` | `frontend` içinde `eslint --fix`, ardından kökten `prettier --write` |
| `frontend/**/*.{css,json}` | `prettier --write` |
| `backend/**/*.py`, `aiService/**/*.py` | `ruff check --fix`, `ruff format` (npm `ruff` paketi; Python venv gerekmez) |

Yapılandırma: [`.lintstagedrc.mjs`](../../.lintstagedrc.mjs), [`.prettierrc`](../../.prettierrc), [`ruff.toml`](../../ruff.toml).

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
cd ../backend && npx ruff check --fix . && npx ruff format .
cd ../aiService && npx ruff check --fix . && npx ruff format .
```

(Kök `node_modules` içinden `npx ruff` kullanıyorsanız kök dizinden de çalıştırabilirsiniz.)
