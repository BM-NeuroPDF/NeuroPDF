# Database Composite Index Benchmark (2026-05-05)

## Scope

Target query patterns:

- `pdf_chat_messages`: ordered reads by `session_id` + `created_at`
- `summary_cache`: lookup by `pdf_hash` + `llm_choice_id`
- `user_auth`: lookup by `provider` + `provider_key`, and user history by `user_id` + `id`
- `pdfs` (files listing): `user_id` + `created_at DESC`

New migration: `backend/alembic/versions/7c3d9e1a2b4c_add_composite_indexes_for_hot_paths.py`

Added composite indexes:

- `ix_pdf_chat_messages_session_id_created_at`
- `ix_summary_cache_pdf_hash_llm_choice_id`
- `ix_user_auth_provider_provider_key`
- `ix_user_auth_user_id_id`
- `ix_pdfs_user_id_created_at`

Redundant indexes removed (covered by left-prefix of composites):

- `ix_pdf_chat_messages_session_id`
- `ix_summary_cache_pdf_hash`
- `ix_pdfs_user_id`

## EXPLAIN (ANALYZE, BUFFERS) Evidence

### 1) `pdf_chat_messages` ordered read

Query:

`SELECT id, role, content FROM pdf_chat_messages WHERE session_id = 's4242' ORDER BY created_at LIMIT 100`

- Before: `Bitmap Index Scan on ix_pdf_chat_messages_session_id` + `Sort`, execution `0.114 ms`
- After: `Bitmap Index Scan on ix_pdf_chat_messages_session_id_created_at` + `Sort`, execution `0.067 ms`

### 2) `summary_cache` hash + model lookup

Query:

`SELECT summary FROM summary_cache WHERE pdf_hash = md5('12345') AND llm_choice_id = 1 LIMIT 1`

- Before: `Index Scan on ix_summary_cache_pdf_hash` + filter on `llm_choice_id`, execution `0.035 ms`
- After: `Index Scan on ix_summary_cache_pdf_hash_llm_choice_id` with full predicate in index condition, execution `0.025 ms`

### 3) `user_auth` provider lookup

Query:

`SELECT user_id FROM user_auth WHERE provider = 'local' AND provider_key = 'user150001@x.dev' LIMIT 1`

- Before: `Parallel Seq Scan on user_auth`, execution `8.390 ms`
- After: `Index Scan on ix_user_auth_provider_provider_key`, execution `0.021 ms`

### 4) `pdfs` files listing

Query:

`SELECT id, filename, created_at FROM pdfs WHERE user_id = 'u42' ORDER BY created_at DESC LIMIT 50`

- Before (single-column index only): `Bitmap Heap Scan on ix_pdfs_user_id` + `top-N sort`, execution `9.625 ms`
- After (composite and redundant single dropped): `Index Scan on ix_pdfs_user_id_created_at`, execution `0.041 ms`

## p95 Microbenchmark (200 iterations/query)

Environment: local PostgreSQL (`neuropdf_local`), synthetic load on target tables.

- `pdf_chat_messages`: p95 `0.202 ms -> 0.148 ms` (`26.8%` faster)
- `summary_cache`: p95 `0.162 ms -> 0.081 ms` (`49.8%` faster)
- `user_auth`: p95 `9.606 ms -> 0.083 ms` (`99.1%` faster)
- `pdfs`: p95 `7.950 ms -> 0.277 ms` (`96.5%` faster)

## Notes

- Query column in the codebase is `pdf_hash` (not `content_hash`), so index is applied as `(pdf_hash, llm_choice_id)`.
- `CREATE INDEX CONCURRENTLY IF NOT EXISTS` is used for online index creation.
- Downgrade recreates removed single-column indexes to keep rollback behavior symmetric.
