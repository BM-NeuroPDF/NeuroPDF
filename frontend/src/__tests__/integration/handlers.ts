import { http, HttpResponse, delay } from 'msw';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Mock response data
const mockUploadResponse = {
  filename: 'test.pdf',
  size_kb: 100,
  temp_id: 'temp-123',
};

const mockSummaryResponse = {
  summary: 'This is a mock summary of the PDF document.',
  status: 'completed',
};

const mockChatSessionResponse = {
  session_id: 'mock-session-123',
  db_session_id: 'mock-db-session-1',
};

const mockChatMessageResponse = {
  answer: 'This is a mock assistant response.',
  role: 'assistant',
};

// Handlers array
export const handlers = [
  // ==========================================
  // PDF Upload
  // ==========================================
  http.post(`${BASE_URL}/files/upload`, async () => {
    await delay(500); // Simulate network delay
    return HttpResponse.json(mockUploadResponse, { status: 200 });
  }),

  // ==========================================
  // PDF Summarize
  // ==========================================
  http.post(`${BASE_URL}/files/summarize`, async () => {
    await delay(1000);
    return HttpResponse.json(mockSummaryResponse, { status: 200 });
  }),

  http.post(`${BASE_URL}/files/summarize-guest`, async () => {
    await delay(1000);
    return HttpResponse.json(mockSummaryResponse, { status: 200 });
  }),

  http.post(`${BASE_URL}/files/summarize-start/:file_id`, async ({ params }) => {
    await delay(500);
    return HttpResponse.json(
      {
        status: 'processing',
        message: 'Özetleme başlatıldı',
        file_id: params.file_id,
      },
      { status: 200 },
    );
  }),

  http.get(`${BASE_URL}/files/summary/:file_id`, async () => {
    await delay(300);
    return HttpResponse.json(
      {
        summary: 'Mock summary text',
        status: 'completed',
      },
      { status: 200 },
    );
  }),

  // ==========================================
  // Chat Endpoints
  // ==========================================
  http.post(`${BASE_URL}/files/chat/start`, async () => {
    await delay(800);
    return HttpResponse.json(mockChatSessionResponse, { status: 200 });
  }),

  http.post(`${BASE_URL}/files/chat/start-from-text`, async () => {
    await delay(800);
    return HttpResponse.json(mockChatSessionResponse, { status: 200 });
  }),

  http.post(`${BASE_URL}/files/chat/message`, async () => {
    await delay(1000);
    return HttpResponse.json(mockChatMessageResponse, { status: 200 });
  }),

  http.get(`${BASE_URL}/files/chat/sessions`, async () => {
    await delay(100);
    return HttpResponse.json(
      {
        sessions: [
          {
            id: 'mock-db-session-1',
            session_id: 'mock-session-123',
            pdf_name: 'test.pdf',
            title: 'test.pdf',
            pdf_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      },
      { status: 200 },
    );
  }),

  http.get(`${BASE_URL}/files/chat/sessions/:id/messages`, async () => {
    await delay(100);
    return HttpResponse.json(
      {
        messages: [
          { role: 'user', content: 'Hi', created_at: new Date().toISOString() },
          {
            role: 'assistant',
            content: 'Hello',
            created_at: new Date().toISOString(),
          },
        ],
      },
      { status: 200 },
    );
  }),

  http.post(`${BASE_URL}/files/chat/sessions/:id/resume`, async () => {
    await delay(200);
    return HttpResponse.json(
      {
        session_id: 'mock-session-123',
        pdf_id: null,
        db_session_id: 'mock-db-session-1',
        filename: 'test.pdf',
      },
      { status: 200 },
    );
  }),

  http.get(`${BASE_URL}/files/stored/:pdfId`, async () => {
    await delay(100);
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    return new HttpResponse(blob, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    });
  }),

  http.post(`${BASE_URL}/files/chat/general/start`, async () => {
    await delay(500);
    return HttpResponse.json(mockChatSessionResponse, { status: 200 });
  }),

  http.post(`${BASE_URL}/files/chat/general/message`, async () => {
    await delay(1000);
    return HttpResponse.json(mockChatMessageResponse, { status: 200 });
  }),

  // ==========================================
  // PDF Operations
  // ==========================================
  http.post(`${BASE_URL}/files/merge-pdfs`, async () => {
    await delay(1500);
    // Return a mock PDF blob
    const mockPdfBlob = new Blob(['mock pdf content'], {
      type: 'application/pdf',
    });
    return new HttpResponse(mockPdfBlob, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="merged.pdf"',
      },
    });
  }),

  http.post(`${BASE_URL}/files/extract-pages`, async () => {
    await delay(1000);
    const mockPdfBlob = new Blob(['extracted pages'], {
      type: 'application/pdf',
    });
    return new HttpResponse(mockPdfBlob, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="extracted.pdf"',
      },
    });
  }),

  http.post(`${BASE_URL}/files/convert-text`, async () => {
    await delay(800);
    const mockTextBlob = new Blob(['Extracted text content'], {
      type: 'text/plain',
    });
    return new HttpResponse(mockTextBlob, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': 'attachment; filename="converted.txt"',
      },
    });
  }),

  http.post(`${BASE_URL}/files/save-processed`, async () => {
    await delay(500);
    return HttpResponse.json(
      {
        file_id: 123,
        filename: 'saved.pdf',
        status: 'saved',
      },
      { status: 200 },
    );
  }),

  // ==========================================
  // Authentication
  // ==========================================
  http.post(`${BASE_URL}/auth/login`, async () => {
    await delay(500);
    return HttpResponse.json(
      {
        status: 'requires_2fa',
        temp_token: 'mock-temp-token-for-msw',
      },
      { status: 200 },
    );
  }),

  http.post(`${BASE_URL}/auth/verify-2fa`, async () => {
    await delay(300);
    return HttpResponse.json(
      {
        access_token: 'mock-access-token-123',
        token_type: 'bearer',
        user_id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        eula_accepted: true,
        created_at: null,
      },
      { status: 200 },
    );
  }),

  http.post(`${BASE_URL}/auth/register`, async () => {
    await delay(500);
    return HttpResponse.json(
      {
        access_token: 'mock-access-token-123',
        token_type: 'bearer',
        user: {
          id: 'user-123',
          email: 'newuser@example.com',
          username: 'newuser',
        },
      },
      { status: 201 },
    );
  }),

  http.post(`${BASE_URL}/auth/google`, async () => {
    await delay(500);
    return HttpResponse.json(
      {
        access_token: 'mock-google-token-123',
        token_type: 'bearer',
        user: {
          id: 'google-user-123',
          email: 'google@example.com',
          username: 'googleuser',
        },
      },
      { status: 200 },
    );
  }),

  http.get(`${BASE_URL}/auth/me`, async () => {
    await delay(200);
    return HttpResponse.json(
      {
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
      },
      { status: 200 },
    );
  }),

  // ==========================================
  // User Avatar
  // ==========================================
  http.get(`${BASE_URL}/api/v1/user/:user_id/avatar`, async () => {
    await delay(300);
    // Return a mock image blob
    const mockImageBlob = new Blob(['mock image'], { type: 'image/png' });
    return new HttpResponse(mockImageBlob, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
      },
    });
  }),

  // ==========================================
  // Guest Endpoints
  // ==========================================
  http.post(`${BASE_URL}/guest/session`, async () => {
    await delay(200);
    return HttpResponse.json(
      {
        guest_id: 'mock-guest-123',
        created_at: new Date().toISOString(),
      },
      { status: 201 },
    );
  }),

  http.get(`${BASE_URL}/guest/check-usage`, async () => {
    await delay(200);
    return HttpResponse.json(
      {
        usage_count: 2,
        max_usage: 3,
        can_use: true,
      },
      { status: 200 },
    );
  }),

  http.post(`${BASE_URL}/guest/use`, async () => {
    await delay(200);
    return HttpResponse.json(
      {
        usage_count: 3,
        max_usage: 3,
        can_use: false,
      },
      { status: 200 },
    );
  }),

  // ==========================================
  // Error Scenarios (for testing error handling)
  // ==========================================
  // Bu handler'lar test sırasında override edilebilir
];
