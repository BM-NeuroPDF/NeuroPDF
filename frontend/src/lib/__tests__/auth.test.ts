import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Session } from 'next-auth';
import { authOptions } from '../auth';

type JwtCallbackArg = Parameters<
  NonNullable<NonNullable<typeof authOptions.callbacks>['jwt']>
>[0];
type SessionCallbackArg = Parameters<
  NonNullable<NonNullable<typeof authOptions.callbacks>['session']>
>[0];

function getCredentialsAuthorize() {
  const p = authOptions.providers[0] as {
    type?: string;
    /** next-auth 4 CredentialsProvider places the real handler in `options` */
    options?: {
      authorize?: (
        credentials: Record<string, string> | undefined,
        ...args: unknown[]
      ) => Promise<unknown>;
    };
    authorize?: (
      credentials: Record<string, string> | undefined,
      ...args: unknown[]
    ) => Promise<unknown>;
  };
  expect(p.type).toBe('credentials');
  const fn = p.options?.authorize ?? p.authorize;
  if (!fn) throw new Error('missing authorize');
  return fn;
}

describe('authOptions', () => {
  it('uses JWT session strategy, custom sign-in page, and NEXTAUTH_SECRET', () => {
    expect(authOptions.session?.strategy).toBe('jwt');
    expect(authOptions.pages?.signIn).toBe('/login');
    expect(authOptions.secret).toBe(process.env.NEXTAUTH_SECRET);
  });

  it('registers Credentials and Google providers', () => {
    expect(authOptions.providers).toHaveLength(2);
    const cred = authOptions.providers[0] as { type?: string; name?: string };
    const google = authOptions.providers[1] as { type?: string; id?: string };
    expect(cred.type).toBe('credentials');
    expect(cred.name).toBe('Credentials');
    expect(google.type).toBe('oauth');
    expect(google.id).toBe('google');
  });
});

describe('CredentialsProvider authorize', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn() as typeof fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns null when only password is provided', async () => {
    const authorize = getCredentialsAuthorize();
    const result = await authorize({
      email: 'a@b.com',
      password: 'secret',
    } as Record<string, string>);
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns null when credentials are empty', async () => {
    const authorize = getCredentialsAuthorize();
    expect(await authorize(undefined)).toBeNull();
    expect(await authorize({} as Record<string, string>)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('strips trailing slash from BACKEND_API_URL for verify-2fa', async () => {
    vi.stubEnv('BACKEND_API_URL', 'http://api.test/');
    const authorize = getCredentialsAuthorize();
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 400 })
    );

    await authorize({
      email: 'u@test.com',
      otpCode: '123456',
      tempToken: 'tok',
    } as Record<string, string>);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://api.test/auth/verify-2fa',
      expect.any(Object)
    );
  });

  it('returns user data when verify-2fa succeeds', async () => {
    vi.stubEnv('BACKEND_API_URL', 'http://localhost:8000');
    const authorize = getCredentialsAuthorize();
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          user_id: 'uid-1',
          email: 'e@e.com',
          username: 'uname',
          access_token: 'jwt',
          eula_accepted: true,
        }),
        { status: 200 }
      )
    );

    const result = (await authorize({
      email: 'e@e.com',
      otpCode: ' 123456 ',
      tempToken: ' temp ',
    } as Record<string, string>)) as Record<string, unknown>;

    expect(result).toMatchObject({
      id: 'uid-1',
      email: 'e@e.com',
      name: 'uname',
      accessToken: 'jwt',
      eula_accepted: true,
    });
  });

  it('uses name fallback to email when username missing', async () => {
    vi.stubEnv('BACKEND_API_URL', 'http://localhost:8000');
    const authorize = getCredentialsAuthorize();
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          user_id: 'u2',
          email: 'only@email.com',
          access_token: 't',
          eula_accepted: false,
        }),
        { status: 200 }
      )
    );

    const result = (await authorize({
      email: 'only@email.com',
      otpCode: '1',
      tempToken: '2',
    } as Record<string, string>)) as { name: string };

    expect(result.name).toBe('only@email.com');
  });

  it('returns null when verify-2fa response is not ok', async () => {
    vi.stubEnv('BACKEND_API_URL', 'http://localhost:8000');
    const authorize = getCredentialsAuthorize();
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 401 }));

    const result = await authorize({
      email: 'e@e.com',
      otpCode: '1',
      tempToken: '2',
    } as Record<string, string>);

    expect(result).toBeNull();
  });

  it('returns null and logs when verify-2fa fetch throws', async () => {
    vi.stubEnv('BACKEND_API_URL', 'http://localhost:8000');
    const authorize = getCredentialsAuthorize();
    vi.mocked(fetch).mockRejectedValue(new Error('network'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await authorize({
      email: 'e@e.com',
      otpCode: '1',
      tempToken: '2',
    } as Record<string, string>);

    expect(result).toBeNull();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('uses default base URL when BACKEND_API_URL is unset', async () => {
    vi.stubEnv('BACKEND_API_URL', '');
    const authorize = getCredentialsAuthorize();
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 400 }));

    await authorize({
      email: 'e@e.com',
      otpCode: '1',
      tempToken: '2',
    } as Record<string, string>);

    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      'http://localhost:8000/auth/verify-2fa'
    );
  });
});

describe('authOptions.callbacks.jwt', () => {
  const jwtCb = authOptions.callbacks?.jwt;
  if (!jwtCb) throw new Error('jwt callback missing');

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn() as typeof fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('copies user fields onto token on first sign-in', async () => {
    const token: Record<string, unknown> = {};
    const user = {
      id: 'u1',
      accessToken: 'at',
      eula_accepted: true,
    };

    const out = await jwtCb({
      token,
      user,
      account: null,
      profile: undefined,
      trigger: 'signIn',
      session: undefined,
      isNewUser: false,
    } as unknown as JwtCallbackArg);

    expect(out.accessToken).toBe('at');
    expect(out.userId).toBe('u1');
    expect(out.eula_accepted).toBe(true);
  });

  it('exchanges Google id_token and updates token when backend ok', async () => {
    vi.stubEnv('BACKEND_API_URL', 'http://backend.test');
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'api-jwt',
          user_id: 'g1',
          eula_accepted: false,
        }),
        { status: 200 }
      )
    );

    const token: Record<string, unknown> = {};
    const out = await jwtCb({
      token,
      user: undefined,
      account: { id_token: 'google-id' },
      profile: undefined,
      trigger: 'signIn',
      session: undefined,
      isNewUser: false,
    } as unknown as JwtCallbackArg);

    expect(fetch).toHaveBeenCalledWith(
      'http://backend.test/auth/google',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id_token: 'google-id' }),
      })
    );
    expect(out.accessToken).toBe('api-jwt');
    expect(out.userId).toBe('g1');
    expect(out.eula_accepted).toBe(false);
  });

  it('does not update token from Google when backend response not ok', async () => {
    vi.stubEnv('BACKEND_API_URL', 'http://backend.test');
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 500 }));

    const token: Record<string, unknown> = { existing: 1 };
    const out = await jwtCb({
      token,
      account: { id_token: 'x' },
      user: undefined,
      profile: undefined,
      trigger: 'signIn',
      session: undefined,
      isNewUser: false,
    } as unknown as JwtCallbackArg);

    expect(out.existing).toBe(1);
    expect(out.accessToken).toBeUndefined();
  });

  it('logs and leaves token when Google exchange throws', async () => {
    vi.stubEnv('BACKEND_API_URL', 'http://backend.test');
    vi.mocked(fetch).mockRejectedValue(new Error('fail'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    const token = { t: 1 };
    const out = await jwtCb({
      token,
      account: { id_token: 'x' },
      user: undefined,
      profile: undefined,
      trigger: 'signIn',
      session: undefined,
      isNewUser: false,
    } as unknown as JwtCallbackArg);

    expect(out).toEqual(token);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('updates eula_accepted when trigger is update and session provides it', async () => {
    const token: Record<string, unknown> = {};
    const out = await jwtCb({
      token,
      user: undefined,
      account: null,
      profile: undefined,
      trigger: 'update',
      session: { eula_accepted: true },
      isNewUser: false,
    } as unknown as JwtCallbackArg);

    expect(out.eula_accepted).toBe(true);
  });

  it('skips eula update when session.eula_accepted is undefined', async () => {
    const token: Record<string, unknown> = { eula_accepted: false };
    const out = await jwtCb({
      token,
      user: undefined,
      account: null,
      profile: undefined,
      trigger: 'update',
      session: {},
      isNewUser: false,
    } as unknown as JwtCallbackArg);

    expect(out.eula_accepted).toBe(false);
  });
});

describe('authOptions.callbacks.session', () => {
  const sessionCb = authOptions.callbacks?.session;
  if (!sessionCb) throw new Error('session callback missing');

  it('maps token fields onto session and user', async () => {
    const session = {
      user: { name: 'N', email: 'e@e.com', image: null },
      expires: '1',
    };

    const out = (await sessionCb({
      session,
      token: {
        accessToken: 'a',
        userId: 'id1',
        eula_accepted: true,
      },
    } as unknown as SessionCallbackArg)) as Session;

    expect(out.accessToken).toBe('a');
    expect(out.userId).toBe('id1');
    expect(out.user?.eula_accepted).toBe(true);
  });

  it('handles missing session.user', async () => {
    const out = (await sessionCb({
      session: { expires: '1' },
      token: { accessToken: 'x', userId: 'u' },
    } as unknown as SessionCallbackArg)) as Session;

    expect(out.accessToken).toBe('x');
    expect(out.user).toBeUndefined();
  });
});
