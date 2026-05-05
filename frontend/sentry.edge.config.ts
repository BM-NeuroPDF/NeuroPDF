import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const env = process.env.NEXT_PUBLIC_SENTRY_ENV || process.env.NODE_ENV || 'development';
const release = process.env.NEXT_PUBLIC_SENTRY_RELEASE || process.env.GIT_SHA || 'dev';
const traces = process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE;
const tracesSampleRate =
  traces && traces !== '' ? Number(traces) : env === 'production' ? 0.1 : 0.0;

if (dsn) {
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
}
