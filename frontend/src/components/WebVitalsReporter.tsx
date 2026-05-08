'use client';

import { useReportWebVitals } from 'next/web-vitals';

export default function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const value = Number(metric.value.toFixed(2));
    void import('@sentry/nextjs')
      .then(({ captureEvent }) => {
        captureEvent({
          level: 'info',
          message: `web-vital:${metric.name}`,
          tags: {
            service: 'frontend',
            metric_name: metric.name,
            metric_id: metric.id,
            metric_label: metric.label,
          },
          extra: {
            web_vital_value: value,
            web_vital_delta: metric.delta,
            web_vital_navigation_type: metric.navigationType,
          },
        });
      })
      .catch(() => {
        /* Sentry not configured or chunk failed */
      });
  });

  return null;
}
