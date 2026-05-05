# Router Modularization Plan (Contract-Safe)

This plan splits `files` and `auth` routers into reviewable PR slices while preserving:

- path/method/params/response models,
- OpenAPI tags and summaries,
- import compatibility (`from app.routers import auth, files`),
- route count parity.

## PR-1: Baseline and Guardrails

- Capture route count baseline from current branch.
- Capture canonical OpenAPI snapshot/hash from current branch.
- Add parity check commands used in each following PR.

Validation:
- `python -c "from app.main import app; print(len(app.routes))"`
- `python - <<'PY' ... openapi hash ... PY`
- `pytest backend/tests/`

## PR-2: Files Router Packaging (No Logic Move)

- Keep runtime `router` from `files._legacy`.
- Keep `routers/files/__init__.py` as compatibility facade.
- Prepare modules:
  - `upload.py`, `chat.py`, `summary.py`, `callback.py`, `convert.py`, `metadata.py`.
- No endpoint contract changes and no route registration changes yet.

Validation:
- files API tests + full backend tests.
- Route count/OpenAPI hash unchanged.

## PR-3: Files Helper/Service Extraction (Incremental)

- Create `app/services/files/` modules and move pure helper logic first:
  - PDF operations (`extract`, `merge`, `reorder`),
  - summarize cache helpers,
  - chat metadata normalization helpers.
- In router handlers, replace inline logic with service calls.
- Keep handler function names, decorators, tags, summaries unchanged.

Validation:
- files tests + full backend tests.
- Route count/OpenAPI hash unchanged.

## PR-4: Files Endpoint Handler Split

- Move route handler functions from `_legacy` into target modules:
  - `summary.py`, `chat.py`, `upload.py`, `convert.py`, `callback.py`, `metadata.py`.
- Re-compose aggregate router in `routers/files/__init__.py` with `include_router`.
- Re-export legacy names needed by tests/patch targets.

Validation:
- full backend tests + API parity checks.

## PR-5: Auth Router Packaging + Shared Extraction

- Keep runtime `router` from `auth._legacy` first.
- Move shared helpers into `auth/_shared.py`.
- Split endpoint handlers into:
  - `session.py`, `account.py`, `eula.py`, `password.py`, `oauth.py` (if needed).
- Re-compose aggregate router in `routers/auth/__init__.py`.
- Preserve test patch compatibility by explicit re-exports.

Validation:
- auth tests + full backend tests + API parity checks.

## PR-6: Cleanup and Decommission Legacy

- Remove duplicated/dead legacy wrappers once parity is proven.
- Keep compatibility exports in package `__init__.py`.
- Ensure each new module remains under 500 LOC.

Validation:
- `pytest backend/tests/`
- Route count parity
- OpenAPI diff `none`

## Follow-up Tracker (must stay open until legacy is zero)

- `backend/app/routers/auth/_legacy.py`: partially reduced; remaining session/password/account deletion flows still pending extraction.
- `backend/app/routers/files/_legacy.py`: pending endpoint-by-endpoint extraction into `upload/chat/summary/callback/convert/metadata`.

