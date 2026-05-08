/**
 * Client Sentry bootstrap (Next.js instrumentation-client convention).
 * Dynamic import keeps @sentry/nextjs out of the synchronous main-app dependency graph.
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

type NavigationType = 'push' | 'replace' | 'traverse';

function loadAndInitSentry(): Promise<typeof import('@sentry/nextjs')> | null {
  if (typeof window === 'undefined' || !dsn) {
    return null;
  }

  return import('@sentry/nextjs').then((Sentry) => {
    const env = process.env.NEXT_PUBLIC_SENTRY_ENV || process.env.NODE_ENV || 'development';
    const release = process.env.NEXT_PUBLIC_SENTRY_RELEASE || process.env.GIT_SHA || 'dev';
    const traces = process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE;
    const tracesSampleRate =
      traces && traces !== '' ? Number(traces) : env === 'production' ? 0.1 : 0.0;

    Sentry.init({
      dsn,
      environment: env,
      release,
      tracesSampleRate,
      sendDefaultPii: false,
      initialScope: {
        tags: {
          service: 'frontend',
          env,
          release,
        },
      },
    });
    return Sentry;
  });
}

const sentryClientPromise = loadAndInitSentry();

if (sentryClientPromise) {
  void sentryClientPromise.catch(() => {
    /* ignore failed SDK load */
  });
}

/** Required for App Router navigation tracing when using instrumentation-client (Sentry Next.js manual setup). */
export function onRouterTransitionStart(url: string, navigationType: NavigationType): void {
  if (!sentryClientPromise) return;
  void sentryClientPromise.then((Sentry) => {
    Sentry.captureRouterTransitionStart(url, navigationType);
  });
}
