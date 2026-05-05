import type { NextConfig } from 'next';
import path from 'path';
import bundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';

const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';

function readMbEnv(keys: string[], fallbackMb: number): number {
  for (const key of keys) {
    const raw = process.env[key];
    if (!raw || raw.trim() === '') continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallbackMb;
}

const maxUploadMb = readMbEnv(
  [
    'NEXT_PUBLIC_MAX_FILE_SIZE_USER_MB',
    'MAX_FILE_SIZE_USER_MB',
    'FRONTEND_MAX_UPLOAD_MB',
  ],
  50
);
const maxUploadBytes = Math.floor(maxUploadMb * 1024 * 1024);

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
  analyzerMode: 'static',
});

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),

  experimental: {
    serverActions: {
      bodySizeLimit: `${maxUploadMb}mb`,
    },
    middlewareClientMaxBodySize: maxUploadBytes,
  },

  async rewrites() {
    return [
      {
        source: '/auth/:path*',
        destination: `${backendUrl}/auth/:path*`,
      },
      {
        source: '/files/:path*',
        destination: `${backendUrl}/files/:path*`,
      },
      {
        source: '/api/v1/:path*',
        destination: `${backendUrl}/api/v1/:path*`,
      },
      {
        source: '/guest/:path*',
        destination: `${backendUrl}/guest/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=()',
          },
        ],
      },
    ];
  },
};

const analyzedConfig = withBundleAnalyzer(nextConfig);

export default withSentryConfig(analyzedConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  release: {
    name: process.env.GIT_SHA || process.env.NEXT_PUBLIC_SENTRY_RELEASE || 'dev',
  },
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
