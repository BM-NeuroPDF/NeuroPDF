# NeuroPDF API Reference (Chat Endpoints)

This document describes the **chat-related** backend API endpoints used by the frontend (ProGlobalChat, dynamic PDF integration). For the full API surface, use the interactive **Swagger UI** at `GET /docs` when the backend is running.

**Base path:** All endpoints below are under `/files` (router prefix).  
**Authentication:** `Authorization: Bearer <JWT>` required unless stated otherwise. The backend uses `get_current_user` to resolve the JWT.

---

## POST /files/chat/start (Dynamic PDF Chat)

Starts a **RAG chat session** with a PDF file. The file is not stored in the backend database; it is sent to the AI Service, which extracts text, chunks it, stores embeddings in ChromaDB, and returns a session ID. Used for **dynamic PDF integration** when the user has a PDF in context and no existing PDF session.

**Request**

- **Method:** `POST`
- **Content-Type:** `multipart/form-data`
- **Body:** One field:
  - `file` (required): PDF file (binary)

**Response**

- **200 OK**
  - `session_id` (string): Session identifier for subsequent messages
  - `filename` (string): Original filename

**Errors**

| Status | Condition |
|--------|-----------|
| 400 | File is not PDF (`content_type != "application/pdf"`) |
| 401 | Missing or invalid JWT |
| 502 | AI Service error (e.g. failed to start session) |
| 500 | Server error |

**Example (frontend):** ProGlobalChat calls this when `pdfFile` is set and `pdfSessionId` is null, sending the file as FormData. The returned `session_id` is stored in context and used with `POST /files/chat/message`.

---

## POST /files/chat/general/start (General Chat, No PDF)

Starts a **general AI chat session** that does not require a PDF. **Pro users only.** Used when the user opens the global ProChat panel and has no active session (general or PDF). The backend checks role via `_check_pro_user` (Supabase/user_roles).

**Request**

- **Method:** `POST`
- **Content-Type:** `application/json`
- **Body (optional):**
  - `llm_provider` (string): `"cloud"` or `"local"`. If omitted, the user's stored preference (DB) is used.
  - `mode` (string): e.g. `"flash"`. Default `"flash"`. For local LLM, mode is effectively fixed.

**Response**

- **200 OK**
  - `session_id` (string): Session identifier for subsequent messages

**Errors**

| Status | Condition |
|--------|-----------|
| 401 | Missing or invalid JWT, or user ID not found |
| 403 | User is not Pro |
| 504 | AI Service timeout |
| 500 | Server error |

**Example (frontend):** ProGlobalChat calls this lazily when the panel is opened and there is no `activeSessionId` (neither PDF nor general session). Then messages are sent via `POST /files/chat/general/message`.

---

## POST /files/chat/message (PDF Chat Message)

Sends a message in an **existing PDF (RAG) chat session**.

**Request**

- **Method:** `POST`
- **Content-Type:** `application/json`
- **Body:**
  - `session_id` (string, required)
  - `message` (string, required)

**Response**

- **200 OK**
  - `answer` (string): AI response text

**Errors:** 400 (missing session_id or message), 401, 404/502 (session or AI error), 429 (rate limit), 504 (timeout).

---

## POST /files/chat/general/message (General Chat Message)

Sends a message in an **existing general chat session**. **Pro users only.**

**Request**

- **Method:** `POST`
- **Content-Type:** `application/json`
- **Body:**
  - `session_id` (string, required)
  - `message` (string, required)

**Response**

- **200 OK**
  - `answer` (string): AI response text

**Errors:** 400 (missing session_id or message), 401, 403 (not Pro), 404/502, 504.

---

## Frontend Usage Summary

- **General chat:** `POST /files/chat/general/start` → then `POST /files/chat/general/message` for each user message.
- **PDF chat (dynamic):** When `pdfFile` is set and there is no PDF session, `POST /files/chat/start` with the file → then `POST /files/chat/message` for each user message.
- **PDF chat (from summary):** `POST /files/chat/start-from-text` (not detailed here) is used when starting from pre-extracted text (e.g. after summarization); messages again via `POST /files/chat/message`.

**Source:** [backend/app/routers/files.py](../../backend/app/routers/files.py).  
**Live API:** Run the backend and open `http://localhost:8000/docs` (Swagger UI).
