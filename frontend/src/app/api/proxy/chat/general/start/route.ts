export const runtime = 'nodejs';
export const maxDuration = 300;

const backendBaseUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const incomingHeaders = req.headers;
    const outgoingHeaders = new Headers();

    const authHeader = incomingHeaders.get('authorization');
    if (authHeader) outgoingHeaders.set('authorization', authHeader);

    const contentType = incomingHeaders.get('content-type');
    if (contentType) outgoingHeaders.set('content-type', contentType);

    const guestId = incomingHeaders.get('x-guest-id');
    if (guestId) outgoingHeaders.set('x-guest-id', guestId);

    const backendResponse = await fetch(
      `${backendBaseUrl}/files/chat/general/start`,
      {
        method: 'POST',
        headers: outgoingHeaders,
        body: rawBody,
        cache: 'no-store',
      }
    );

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: backendResponse.headers,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Proxy request failed for /files/chat/general/start';
    return new Response(JSON.stringify({ detail: message }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}
