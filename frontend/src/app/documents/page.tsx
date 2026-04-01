'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { FileText, MessageCircle, PencilLine, RefreshCw } from 'lucide-react';
import useSWR from 'swr';
import {
  fetchStoredPdfBlob,
  swrFetcher,
  type UserDocumentListItem,
} from '@/utils/api';
import { usePdf } from '@/context/PdfContext';

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatSize(size: number | null): string {
  if (!size || size <= 0) return '-';
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export default function DocumentsPage() {
  const router = useRouter();
  const { status } = useSession();
  const { saveExistingPdf, setProChatOpen } = usePdf();

  const [actionError, setActionError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR<{
    files: UserDocumentListItem[];
    total: number;
  }>(status === 'authenticated' ? '/files/my-files' : null, swrFetcher);

  const documents = data?.files ?? [];
  const hasDocuments = useMemo(() => documents.length > 0, [documents.length]);

  const loading = status === 'authenticated' ? isLoading : false;
  const queryError =
    error instanceof Error
      ? error.message
      : error
        ? 'Belgeler yüklenirken bir hata oluştu.'
        : null;
  const errorMessage =
    status === 'unauthenticated'
      ? 'Belgelerinizi görmek için giriş yapmanız gerekiyor.'
      : actionError || queryError;

  useEffect(() => {
    if (status !== 'authenticated') {
      setActionError(null);
    }
  }, [status]);

  const openDocument = async (
    doc: UserDocumentListItem,
    target: 'edit' | 'chat'
  ) => {
    setOpeningId(doc.id);
    try {
      setActionError(null);
      const blob = await fetchStoredPdfBlob(doc.id);
      const filename = doc.filename?.trim() || 'document.pdf';
      const finalName = filename.toLowerCase().endsWith('.pdf')
        ? filename
        : `${filename}.pdf`;
      const file = new File([blob], finalName, { type: 'application/pdf' });
      await saveExistingPdf(file, doc.id);

      if (target === 'chat') {
        setProChatOpen(true);
        router.push('/summarize-pdf');
      } else {
        router.push('/edit-pdf');
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Belge açılamadı. Lütfen tekrar deneyin.';
      setActionError(message);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <section className="max-w-7xl mx-auto space-y-6">
        <div className="docs-surface p-6 rounded-3xl shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest opacity-60">
                My Documents
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold">Belgelerim</h1>
              <p className="text-sm opacity-70 mt-1">
                Hesabınızda kayıtlı PDF belgelerinizi görüntüleyin ve kaldığınız
                yerden devam edin.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void mutate()}
              disabled={loading}
              className="docs-btn-muted px-4 py-2 rounded-xl inline-flex items-center gap-2 text-sm font-semibold"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              />
              Yenile
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="error-box rounded-xl p-4 text-sm font-medium">
            {errorMessage}
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={`doc-skeleton-${idx}`}
                className="container-card rounded-2xl border p-5 animate-pulse"
              >
                <div className="h-6 w-6 rounded bg-gray-300/50 mb-4" />
                <div className="h-4 w-2/3 rounded bg-gray-300/40 mb-2" />
                <div className="h-3 w-1/2 rounded bg-gray-300/30 mb-6" />
                <div className="h-9 w-full rounded bg-gray-300/30" />
              </div>
            ))}
          </div>
        )}

        {!loading && !hasDocuments && !errorMessage && (
          <div className="container-card rounded-3xl border p-10 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
              <FileText className="w-7 h-7 text-indigo-600 dark:text-indigo-300" />
            </div>
            <h2 className="text-xl font-semibold">Henüz belge yüklemediniz</h2>
            <p className="text-sm opacity-70 mt-2">
              İlk PDF belgenizi yükleyerek bu alanda tüm geçmiş dokumanlarınızı
              görebilirsiniz.
            </p>
            <button
              type="button"
              onClick={() => router.push('/upload')}
              className="docs-btn-muted mt-6 px-5 py-2.5 rounded-xl font-semibold"
            >
              PDF Yüklemeye Git
            </button>
          </div>
        )}

        {!loading && hasDocuments && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {documents.map((doc) => {
              const opening = openingId === doc.id;
              return (
                <article
                  key={doc.id}
                  className="docs-surface rounded-2xl p-5 transition-all hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => void openDocument(doc, 'edit')}
                    disabled={opening}
                    className="w-full text-left !bg-transparent !text-inherit !p-0 !border-0 hover:!bg-transparent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--container-bg)] border border-[var(--container-border)] flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 opacity-75" />
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full border border-[var(--container-border)] bg-[var(--container-bg)] opacity-75">
                        PDF
                      </span>
                    </div>
                    <h3 className="mt-4 font-semibold text-base line-clamp-2">
                      {doc.filename || 'Adsız Belge'}
                    </h3>
                    <div className="mt-3 text-xs opacity-70 space-y-1">
                      <p>Yuklenme: {formatDate(doc.created_at)}</p>
                      <p>Boyut: {formatSize(doc.file_size)}</p>
                      <p>Sayfa: {doc.page_count ?? '-'}</p>
                    </div>
                  </button>

                  <div className="mt-5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void openDocument(doc, 'edit')}
                      disabled={opening}
                      className="docs-btn-muted flex-1 rounded-xl px-3 py-2 text-sm font-medium inline-flex items-center justify-center gap-2"
                    >
                      <PencilLine className="w-4 h-4" />
                      Duzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => void openDocument(doc, 'chat')}
                      disabled={opening}
                      className="docs-btn-accent flex-1 rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center justify-center gap-2"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Sohbet
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
