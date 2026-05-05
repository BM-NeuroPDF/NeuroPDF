# Upgrade Roadmap (Major Updates)

This roadmap separates major upgrades into small, reviewable PRs with explicit risk, migration steps, and verification.

## 1) Frontend Categorization

### Build/Test Toolchain

- Vite / Vitest / `@vitejs/plugin-react`
- ESLint (`eslint`, `eslint-config-next`)
- TypeScript

### Framework

- Next.js
- NextAuth

### UI Layer

- Tailwind CSS + PostCSS adapter
- shadcn/ui stack
- Radix primitives
- `lucide-react`, `framer-motion`, `tailwind-merge`

## 2) Major Upgrade PR Plan

### PR-A (Completed this week): Vitest major line 2 -> 3

- Scope:
  - `vitest`: `^2.1.8` -> `^3.2.4`
  - `@vitest/coverage-v8`: `^2.1.8` -> `^3.2.4`
- Breaking/risk:
  - Stricter unhandled async/timer detection in tests.
- Migration steps:
  - Upgrade packages.
  - Fix teardown stability in OTP test (`cleanup + timer drain`).
- Expected test behavior changes:
  - Existing tests still pass; runner now surfaces async leakage more strictly.
- Result:
  - `npm run test:run` passes.
  - `npm run build` passes.
  - `npm run lint` passes (existing warning unchanged).

### PR-B: Vite major (`@vitejs/plugin-react` 4 -> 6) + Vitest 4 alignment

- Breaking/risk:
  - Plugin API/options drift; Vite CJS usage warnings likely require ESM-native config/tooling.
- Migration steps:
  - Upgrade plugin and Vitest 4 together.
  - Validate `vitest.config.ts` compatibility.
  - Resolve CJS deprecation path (move config/tool invocation to ESM-safe flow).
- Expected post-test changes:
  - Potential snapshot/transform diffs.
  - Possible setup/runtime warning changes.

### PR-C: ESLint / Next lint pipeline major track

- Breaking/risk:
  - Next 16 removes `next lint` path; must migrate to plain ESLint CLI.
- Migration steps:
  - Keep `eslint` v9 if plugin ecosystem not v10-ready.
  - Migrate command using Next codemod guidance and flat config alignment.
- Expected post-test changes:
  - Script changes (`lint` command semantics).
  - New rule defaults may add warnings/errors.

### PR-D: Next.js 15 -> 16 (+ NextAuth compatibility)

- Breaking/risk:
  - App router behavior, middleware/auth adapter compatibility, runtime edge cases.
- Migration steps:
  - Upgrade `next` first in isolated PR.
  - Verify `next-auth` compatibility matrix and adapter/session behavior.
  - Re-run build, auth integration tests, route-level smoke.
- Expected post-test changes:
  - `next lint` removal handling mandatory.
  - Potential auth callback/session flow updates.

### PR-E: UI major line upgrades (Tailwind stable, Radix/shadcn ecosystem)

- Breaking/risk:
  - Class/token behavior changes, primitive API changes.
- Migration steps:
  - Tailwind alpha -> stable with adapter updates first.
  - Upgrade `tailwind-merge`, then Radix/shadcn primitives in small batches.
  - Visual regression checks for critical screens.
- Expected post-test changes:
  - Snapshot/UI test drift likely.

## 3) Backend / aiService Plan

### PyPDF2 -> pypdf (aiService)

- Current state:
  - `backend` already uses `pypdf`.
  - `aiService/requirements.txt` still lists `PyPDF2`.
- Planned PR:
  - Replace dependency with `pypdf`.
  - Update imports (`from PyPDF2 import ...` -> `from pypdf import ...`).
  - Re-run AI service unit/regression tests.

### FastAPI / Starlette / Pydantic verification

- Runtime check (backend + aiService):
  - FastAPI: `0.128.0`
  - Starlette: `0.50.0`
  - Pydantic: `2.12.5`
- Conclusion:
  - Pydantic v2 migration is already complete; no v1->v2 migration PR needed.

## 4) Priority, Risk, Effort

1. **PR-A Vitest 3** - Low risk, low effort, completed.
2. **PR-B Vite plugin + Vitest 4** - Medium risk, medium effort.
3. **PR-C ESLint/Next lint pipeline** - Medium risk, medium effort.
4. **PR-E UI stack majors** - Medium-high risk, medium-high effort.
5. **PR-D Next 16 + NextAuth** - High risk, high effort.
6. **Backend aiService PyPDF2->pypdf** - Low-medium risk, low effort.

## 5) `npm outdated` Before/After (frontend)

- Before:
  - `vitest` and `@vitest/coverage-v8` were on `2.x` line (`wanted` `2.1.9`, `latest` `4.1.5`).
- After PR-A:
  - `vitest` and `@vitest/coverage-v8` moved to `3.2.4`.
  - Remaining major candidates are still tracked for separate PRs (Next 16, plugin-react 6, TS 6, Tailwind stable, etc.).
