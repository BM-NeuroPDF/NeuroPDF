'use client';

import dynamic from 'next/dynamic';

const DocumentsClientPanel = dynamic(() => import('@/components/documents/DocumentsClientPanel'), {
  ssr: false,
  loading: () => (
    <section className="max-w-7xl mx-auto space-y-6">
      <div className="docs-surface p-6 rounded-3xl shadow-sm">
        <div className="h-8 w-48 rounded bg-gray-300/30 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={`doc-shell-${idx}`}
            className="container-card rounded-2xl border p-5 animate-pulse"
          >
            <div className="h-6 w-6 rounded bg-gray-300/50 mb-4" />
            <div className="h-4 w-2/3 rounded bg-gray-300/40 mb-2" />
            <div className="h-3 w-1/2 rounded bg-gray-300/30 mb-6" />
            <div className="h-9 w-full rounded bg-gray-300/30" />
          </div>
        ))}
      </div>
    </section>
  ),
});

export default function DocumentsPage() {
  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <DocumentsClientPanel />
    </main>
  );
}
