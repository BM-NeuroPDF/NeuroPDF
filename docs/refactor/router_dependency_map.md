# Router Dependency Map (Files/Auth)

This map documents current runtime handlers (`app.routers.files._legacy`, `app.routers.auth._legacy`) and the primary dependencies each endpoint touches. It is the baseline for safe modular extraction without contract changes.

## Files Router (`/files`)

| Endpoint | Handler | Key dependencies | Target module | Status |
|---|---|---|---|---|
| `GET /files/user/llm-choice` | `get_llm_choice` | `get_current_user`, `get_db`, `db.query(User)` | `metadata.py` |
| `POST /files/user/update-llm` | `update_llm_choice` | `get_current_user`, `get_db`, `db.commit/rollback` | `metadata.py` |
| `POST /files/summarize` | `summarize_file` | `validate_file_size`, `get_user_llm_choice`, `check_summarize_cache_by_hash`, AI HTTP client, `increment_user_usage_task`, `save_summarize_cache_background` | `summary.py` |
| `POST /files/summarize-guest` | `summarize_for_guest` | `check_rate_limit`, AI HTTP client, `PUBLIC_LIMITS` | `summary.py` |
| `POST /files/summarize-start/{file_id}` | `trigger_summarize_task` | `supabase.documents`, `user_repo.get_llm_provider`, AI HTTP client | `summary.py` |
| `POST /files/callback/{pdf_id}` | `handle_ai_callback` | `check_rate_limit`, `supabase.documents` updates | `callback.py` |
| `GET /files/summary/{file_id}` | `get_file_summary` | `supabase.documents` read | `summary.py` |
| `POST /files/chat/start-from-text` | `start_chat_from_text` | `user_repo.get_llm_provider`, PDF extract helpers, AI HTTP client, `create_pdf_chat_session_record` | `chat.py` |
| `POST /files/chat/start` | `start_chat_session` | `save_pdf_to_db`, PDF extract helpers, AI HTTP client, `create_pdf_chat_session_record` | `chat.py` |
| `POST /files/chat/message` | `send_chat_message` | AI HTTP client, `_normalize_message_metadata`, `append_chat_turn` | `chat.py` |
| `GET /files/chat/sessions` | `list_pdf_chat_sessions` | `list_user_chat_sessions` | `chat.py` |
| `GET /files/chat/sessions/{session_db_id}/messages` | `get_pdf_chat_session_messages` | `get_chat_session_by_db_id`, `get_session_messages_ordered` | `chat.py` |
| `POST /files/chat/sessions/{session_db_id}/resume` | `resume_pdf_chat_session` | chat session/message helpers, PDF extract helpers, AI HTTP client | `chat.py` |
| `GET /files/stored/{pdf_id}` | `download_stored_pdf` | `get_pdf_from_db`, `StreamingResponse` | `upload.py` |
| `POST /files/chat/general/start` | `start_general_chat` | `user_repo.get_user_role_and_llm_provider`, AI HTTP client | `chat.py` |
| `POST /files/chat/general/message` | `send_general_chat_message` | `user_repo.get_user_role_and_llm_provider`, AI HTTP client | `chat.py` |
| `POST /files/chat/translate-message` | `translate_chat_message` | `user_repo.get_user_role_and_llm_provider`, AI HTTP client | `chat.py` |
| `POST /files/markdown-to-pdf` | `markdown_to_pdf` | reportlab builders, threadpool | `convert.py` |
| `POST /files/listen-summary` | `listen_summary` | `clean_markdown_for_tts`, streamed AI HTTP client | `summary.py` |
| `POST /files/upload` | `upload_pdf` | `check_rate_limit`, `validate_file_size`, `save_pdf_to_db` | `upload.py` |
| `GET /files/my-files` | `get_my_files` | `list_user_pdfs` | `upload.py` |
| `DELETE /files/files/{file_id}` | `delete_file` | `get_pdf_from_db`, `delete_pdf_from_db` | `upload.py` |
| `POST /files/convert-text` | `convert_text_from_pdf` | PDF extract helpers, threadpool, usage increment | `convert.py` |
| `POST /files/extract-pages` | `extract_pdf_pages` | rate-limit, PDF extract helper, threadpool | `convert.py` |
| `POST /files/merge-pdfs` | `merge_pdfs` | rate-limit, PDF merge helper, threadpool | `convert.py` |
| `POST /files/save-processed` | `save_processed_pdf` | `save_pdf_to_db` | `upload.py` |
| `POST /files/reorder` | `reorder_pdf` | PDF reorder helper, threadpool | `convert.py` |
| `GET /files/user/stats` | `get_user_stats` | `stats_cache_get_json/set_json`, `stats_repo.get_user_stats` | `metadata.py` |
| `GET /files/global-stats` | `get_global_stats` | rate-limit, stats cache helpers, `stats_repo.get_global_stats` | `metadata.py` |

## Auth Router (`/auth`)

| Endpoint | Handler | Key dependencies | Target module |
|---|---|---|---|
| `POST /auth/google` | `google_login` | `check_rate_limit`, `auth_service.verify_google_token`, `security.create_jwt`, Supabase/SQL branches, avatar creation | `session.py` / `oauth.py` |
| `POST /auth/register` | `register_user` | `check_rate_limit`, `security.hash_password`, `security.create_jwt`, Supabase/SQL branches | `account.py` |
| `POST /auth/login` | `login` | `check_rate_limit`, password verify/migration, `set_redis_otp`, `send_login_otp_email`, pending token | `session.py` |
| `POST /auth/verify-2fa` | `verify_2fa` | verify rate-limit/lockout helpers, `decode_2fa_pending_token`, Redis OTP read/delete, `security.create_jwt`, mark email verified | `session.py` / `password.py` |
| `GET /auth/eula` | `get_eula` | `helpers.get_eula_content` | `eula.py` | moved |
| `POST /auth/accept-eula` | `accept_eula` | `get_current_user_dep`, Supabase/SQL branch update | `eula.py` | moved |
| `GET /auth/me` | `get_me` | `get_current_user_dep`, user/settings/auth reads | `account.py` | moved |
| `POST /auth/request-deletion-otp` | `request_deletion_otp` | provider discovery, Redis deletion OTP helpers, deletion OTP mail | `account.py` | pending |
| `POST /auth/verify-and-delete` | `verify_and_delete` | provider split, password/OTP verification, account deletion executor | `account.py` | pending |
| `DELETE /auth/delete-account` | `delete_account` | password verification + account deletion executor | `account.py` | pending |
