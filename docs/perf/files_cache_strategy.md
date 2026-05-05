# Files Endpoint Cache Strategy

## Measured Candidates

Target read endpoints:

- `GET /files/my-files`
- `GET /files/chat/sessions`
- `GET /files/chat/sessions/{id}/messages`

Recommended local benchmark command:

- `wrk -t4 -c32 -d30s http://localhost:8000/files/my-files`
- `wrk -t4 -c32 -d30s http://localhost:8000/files/chat/sessions`
- `wrk -t4 -c32 -d30s http://localhost:8000/files/chat/sessions/<id>/messages`

## Keys and TTL

- `GET /files/my-files`
  - key: `user:{user_id}:files:list:v1`
  - ttl: `60s`
- `GET /files/chat/sessions`
  - key: `user:{user_id}:chat:sessions:list:v1`
  - ttl: `60s`
- `GET /files/chat/sessions/{id}/messages`
  - key: `user:{user_id}:chat:session:{session_db_id}:messages:v1`
  - ttl: `45s`

## Invalidation Triggers

- `upload_pdf`, `save_processed_pdf`, `delete_file`:
  - delete: `user:{user_id}:files:list:v1`
- `start_chat_from_text`, `start_chat_session`:
  - delete: `user:{user_id}:chat:sessions:list:v1`
- `send_chat_message`:
  - delete: `user:{user_id}:chat:session:{session_id}:messages:v1`
  - delete: `user:{user_id}:chat:sessions:list:v1`

## SWR Decision

`stale-while-revalidate` is **not enabled** for these endpoints.

Reason:

- data correctness after CRUD is more important than serving stale state;
- explicit invalidation on writes already keeps hot reads fast with short TTL;
- this avoids stale session/message confusion after user actions.

## Observability

Each cached endpoint logs hit/miss:

- `cache_hit endpoint=my_files ...`
- `cache_miss endpoint=my_files ...`
- `cache_hit endpoint=chat_sessions ...`
- `cache_miss endpoint=chat_sessions ...`
- `cache_hit endpoint=chat_session_messages ...`
- `cache_miss endpoint=chat_session_messages ...`
