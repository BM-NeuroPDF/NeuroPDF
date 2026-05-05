export const runtime = 'nodejs';
export const maxDuration = 300;

const backendBaseUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';

function buildProxyHeaders(incoming: Headers): Headers {
  const outgoing = new Headers();
  const authHeader = incoming.get('authorization');
  if (authHeader) outgoing.set('authorization', authHeader);

  const contentType = incoming.get('content-type');
  if (contentType) outgoing.set('content-type', contentType);

  const guestId = incoming.get('x-guest-id');
  if (guestId) outgoing.set('x-guest-id', guestId);
  return outgoing;
}

export async function GET(req: Request) {
  try {
    const backendResponse = await fetch(`${backendBaseUrl}/files/chat/sessions`, {
      method: 'GET',
      headers: buildProxyHeaders(req.headers),
      cache: 'no-store',
    });

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: backendResponse.headers,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Proxy request failed for /files/chat/sessions';
    return new Response(JSON.stringify({ detail: message }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}
