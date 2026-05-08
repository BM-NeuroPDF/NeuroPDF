'use client';

import dynamic from 'next/dynamic';

/** Layout bir Server Component; `ssr: false` dinamik yüklemesi yalnızca client sınırında kullanılabilir. */
const ResponsivePdfPanel = dynamic(() => import('@/components/ResponsivePdfPanel'), {
  ssr: false,
  loading: () => null,
});

export default function ResponsivePdfPanelDynamic() {
  return <ResponsivePdfPanel />;
}
