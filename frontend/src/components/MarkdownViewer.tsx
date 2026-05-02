'use client';

import { useState } from 'react';
import { pdfService } from '@/services/pdfService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = {
  markdown: string;
  defaultPdfName?: string;
  height?: number | string;
};

export default function MarkdownViewer({
  markdown,
  defaultPdfName = 'summary.pdf',
  height,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Normalizes markdown text to fix common issues like:
   * 1. Unicode bullets (•) instead of markdown bullets (*).
   * 2. Excess spaces after bullets/points (common in older or local LLM outputs).
   */
  const normalizeMarkdown = (text: string) => {
    if (!text) return '';

    return text
      .split('\n')
      .map((line) => {
        const l = line;
        // Start with trimming to find bullet/number
        const trimmed = l.trim();

        // Match bullet characters or numbered lists
        if (/^[•\-*]\s+/.test(trimmed)) {
          // Standardize to '*' and remove extra spaces
          return trimmed.replace(/^[•\-*]\s+/, '* ');
        }

        // Also handle numbered lists followed by excessive spaces (e.g., "1.    Text")
        if (/^\d+\.\s+/.test(trimmed)) {
          return trimmed.replace(/^(\d+\.)\s+/, '$1 ');
        }

        return l; // Keep original line if no match
      })
      .join('\n');
  };

  const processedMarkdown = normalizeMarkdown(markdown);

  const handleDownloadPdf = async () => {
    setError(null);
    try {
      setLoading(true);
      // PDF oluştur ve indir
      await pdfService.createPdfFromMarkdown(processedMarkdown, defaultPdfName);
    } catch (err: unknown) {
      console.error('❌ PDF oluşturulamadı:', err);
      setError('PDF oluşturulamadı. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  if (!markdown) {
    return (
      <div className="w-full p-6 text-center text-gray-500 dark:text-gray-400">
        Özet henüz hazır değil.
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-4 font-sans text-[var(--foreground)]">
      {/* Markdown Render */}
      <div
        className="prose dark:prose-invert max-w-full p-4 rounded-xl border overflow-auto"
        style={{
          height: height || 'auto',
          backgroundColor: 'var(--background)',
          borderColor: 'var(--navbar-border)',
          color: 'var(--foreground)',
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {processedMarkdown}
        </ReactMarkdown>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={loading}
          className="text-sm px-3 py-1.5 rounded-lg border border-[var(--navbar-border)] hover:opacity-90 disabled:opacity-50"
        >
          {loading ? '…' : 'PDF indir'}
        </button>
      </div>

      {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
    </div>
  );
}
