# ts-prune (dead export analysis)

- **Run:** `cd frontend && npm run analyze:dead` (exits 0; informational only, no `-e`).
- **Config:** `frontend/.ts-prunerc` (cosmiconfig). Uses `tsconfig.ts-prune.json` to avoid pulling `.next` into the program graph where possible.
- **`ignore` regex:** Filters known false positives: Next.js App Router entry files (`page`, `layout`, `route`, `not-found`, `error`, `loading`), root/tooling (`instrumentation`, `middleware`, `next.config`, Playwright/Vitest/Sentry configs), `src/auth.config.ts` (NextAuth entry), `.next/**` generated types, and `src/schemas/index.ts` (barrel; callers use `@/schemas/<module>`).

Rough baseline (same repo, `npx ts-prune | wc -l`): ~119 with default `tsconfig.json` and no config → **38** with `.ts-prunerc` + internalized module-only types.
