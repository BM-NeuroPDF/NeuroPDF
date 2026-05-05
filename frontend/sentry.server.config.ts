import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
const env = process.env.SENTRY_ENV || process.env.NODE_ENV || 'development';
const release =
  process.env.GIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.NEXT_PUBLIC_SENTRY_RELEASE ||
  'dev';
const traces = process.env.SENTRY_TRACES_SAMPLE_RATE;
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
