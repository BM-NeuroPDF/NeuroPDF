'use client';

import type { ChangeEventHandler, RefObject } from 'react';
import type { AvatarModalT } from './avatarTypes';

type AvatarUploadStepProps = {
  t: AvatarModalT;
  uploading: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileUpload: ChangeEventHandler<HTMLInputElement>;
  onChooseGenerate: () => void;
};

export function AvatarUploadStep({
  t,
  uploading,
  fileInputRef,
  onFileUpload,
  onChooseGenerate,
}: AvatarUploadStepProps) {
  return (
    <div className="animate-in slide-in-from-left-4 duration-300">
      <div className="text-center mb-8 mt-2">
        <div className="w-20 h-20 mx-auto bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-purple-500/20">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-10 h-10 text-white"
          >
            <path d="M12 9a3.75 3.75 0 100 7.5A3.75 3.75 0 0012 9z" />
            <path
              fillRule="evenodd"
              d="M9.344 3.071a4.993 4.993 0 015.312 0l.208.107a.6.6 0 01.394.537l.12 1.637c.042.569.458 1.031 1.01 1.13l1.58.283a.6.6 0 01.492.684l-.326 1.956a2.022 2.022 0 01-.137.49l-.57 1.425a.6.6 0 01-.795.26l-1.63-.815a1.5 1.5 0 00-1.892 2.012l.617 1.628a.6.6 0 01-.17.72l-1.503 1.127a2.003 2.003 0 01-2.398 0l-1.503-1.127a.6.6 0 01-.17-.72l.617-1.628a1.5 1.5 0 00-1.892-2.012l-1.63.815a.6.6 0 01-.795-.26l-.57-1.425a2.022 2.022 0 01-.137-.49l-.326-1.956a.6.6 0 01.492-.684l1.58-.283a1.2 1.2 0 001.01-1.13l.12-1.637a.6.6 0 01.394-.537l.208-.107zM7.5 12.75a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <h3 className="text-2xl font-bold">
          {t('changeProfileImage') || 'Profil Resmini Değiştir'}
        </h3>
        <p className="text-sm opacity-60 mt-1">
          {t('chooseImageOption') || 'Yeni bir görünüm için yöntem seçin.'}
        </p>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full group relative flex items-center p-4 rounded-2xl border border-[var(--navbar-border)] hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-left"
        >
          <input
            type="file"
            accept="image/png"
            ref={fileInputRef}
            onChange={onFileUpload}
            className="hidden"
          />
          <div className="p-3 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 group-hover:scale-110 transition-transform">
            {uploading ? (
              <svg
                className="animate-spin h-6 w-6"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
            )}
          </div>
          <div className="ml-4">
            <p className="font-bold text-lg">{t('uploadPng') || 'PNG Yükle'}</p>
            <p className="text-xs opacity-60">
              {t('uploadPngHint') || 'Cihazınızdan bir dosya seçin.'}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={onChooseGenerate}
          className="w-full group relative flex items-center p-4 rounded-2xl border border-[var(--navbar-border)] hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-all text-left"
        >
          <div className="p-3 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 group-hover:scale-110 transition-transform">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 00-1.423 1.423z"
              />
            </svg>
          </div>
          <div className="ml-4">
            <p className="font-bold text-lg">{t('generateWithAI') || 'AI ile Oluştur'}</p>
            <p className="text-xs opacity-60">
              {t('generateWithAIHint') || 'Yapay zeka ile size özel bir avatar.'}
            </p>
          </div>
          <div className="absolute top-4 right-4 px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-full">
            NEW
          </div>
        </button>
      </div>
    </div>
  );
}
