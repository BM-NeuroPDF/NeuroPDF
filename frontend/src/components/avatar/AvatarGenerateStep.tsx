'use client';

import type { ChangeEvent, RefObject } from 'react';

type AvatarGenerateStepProps = {
  onBack: () => void;
  generating: boolean;
  previewImage: string | null;
  referencePreview: string | null;
  refInputRef: RefObject<HTMLInputElement | null>;
  onReferenceSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  onPickReference: () => void;
  aiPrompt: string;
  setAiPrompt: (v: string) => void;
  onGenerate: () => void;
  clearReference: () => void;
  showPromptForm: boolean;
};

export function AvatarGenerateStep({
  onBack,
  generating,
  previewImage,
  referencePreview,
  refInputRef,
  onReferenceSelect,
  onPickReference,
  aiPrompt,
  setAiPrompt,
  onGenerate,
  clearReference,
  showPromptForm,
}: AvatarGenerateStepProps) {
  return (
    <div className="animate-in slide-in-from-right-4 duration-300 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={onBack}
          className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-5 h-5"
          >
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <h3 className="text-lg font-bold">AI Avatar Studio</h3>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-black/20 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 mb-4 min-h-[250px] relative overflow-hidden">
        {generating ? (
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-medium animate-pulse text-purple-500">Sihir yapılıyor...</p>
          </div>
        ) : previewImage ? (
          <img
            src={previewImage}
            alt="AI Preview"
            className="w-full h-full object-contain animate-in zoom-in duration-300"
          />
        ) : (
          <div className="text-center opacity-40 p-6">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1}
              stroke="currentColor"
              className="w-16 h-16 mx-auto mb-2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 00-1.423 1.423z"
              />
            </svg>
            <p className="text-sm">Bir açıklama yazın ve avatarınızı oluşturun.</p>
          </div>
        )}
      </div>

      {showPromptForm && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 mb-1">
            <button
              type="button"
              onClick={onPickReference}
              className="text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-3.5 h-3.5"
              >
                <path
                  fillRule="evenodd"
                  d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.22-2.219a.75.75 0 00-1.06 0l-1.91 1.909.47.47a.75.75 0 11-1.06 1.06L6.53 8.091a.75.75 0 00-1.06 0l-2.97 2.97zM12 7a1 1 0 11-2 0 1 1 0 012 0z"
                  clipRule="evenodd"
                />
              </svg>
              {referencePreview ? 'Fotoğrafı Değiştir' : '📸 Fotoğraf Ekle (Referans)'}
            </button>

            <input
              type="file"
              accept="image/png"
              ref={refInputRef}
              onChange={onReferenceSelect}
              className="hidden"
            />

            {referencePreview && (
              <div className="relative w-8 h-8 rounded overflow-hidden border border-gray-300 dark:border-gray-600 group">
                <img src={referencePreview} className="w-full h-full object-cover" alt="ref" />
                <button
                  type="button"
                  onClick={clearReference}
                  className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4"
                  >
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={
                referencePreview
                  ? 'Fotoğrafta neyi değiştireyim? (Örn: Gözlük tak)'
                  : 'Örn: Mavi gözlü, kask takan fütüristik kedi...'
              }
              className="flex-1 bg-gray-100 dark:bg-white/5 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-purple-500 outline-none"
              onKeyDown={(e) => e.key === 'Enter' && onGenerate()}
            />
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating || !aiPrompt.trim()}
              className="bg-purple-600 text-white p-3 rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-6 h-6"
              >
                <path
                  fillRule="evenodd"
                  d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436h.671A3.375 3.375 0 0120.462 18v.416a1.5 1.5 0 01-1.5 1.5h-5.996a1.5 1.5 0 01-1.5-1.5V18a3.375 3.375 0 013.375-3.375h.67C12.436 10.941 7.935 8.558 2.879 8.558a.75.75 0 01-.75-.75c0-5.055 2.383-9.555 6.084-12.436h-.671A3.375 3.375 0 014.217 1.5V1.084a1.5 1.5 0 011.5-1.5h5.996a1.5 1.5 0 011.5 1.5V1.5a3.375 3.375 0 01-3.375 3.375h-.671c2.881 3.684 7.381 6.067 12.436 6.067a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436h.671A3.375 3.375 0 0120.462 18v.416a1.5 1.5 0 01-1.5 1.5h-5.996a1.5 1.5 0 01-1.5-1.5V18a3.375 3.375 0 013.375-3.375h.671z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
