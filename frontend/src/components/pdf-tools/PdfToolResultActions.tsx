'use client';

import type { Session } from 'next-auth';
import type { TranslateFn, TranslationKey } from '@/utils/translations';

type PdfToolResultActionsProps = {
  onDownload: () => void;
  onSave: () => void;
  onReset: () => void;
  saving: boolean;
  session: Session | null | undefined;
  t: TranslateFn;
  saveLabelKey?: TranslationKey;
};

export default function PdfToolResultActions({
  onDownload,
  onSave,
  onReset,
  saving,
  session,
  t,
  saveLabelKey = 'saveToFiles',
}: PdfToolResultActionsProps) {
  return (
    <>
      <div className="flex gap-4 flex-wrap">
        <button
          onClick={onDownload}
          className="btn-primary shadow-md hover:scale-105"
          type="button"
        >
          {t('download')}
        </button>
        {session && (
          <button
            onClick={onSave}
            disabled={saving}
            className="btn-primary shadow-md hover:scale-105 disabled:opacity-50"
            type="button"
          >
            {saving ? t('saving') : t(saveLabelKey)}
          </button>
        )}
        <button onClick={onReset} className="btn-primary shadow-md hover:scale-105" type="button">
          {t('newProcess')}
        </button>
      </div>
      {!session && (
        <p className="mt-4 text-sm opacity-80">
          💡{' '}
          <a href="/login" className="underline font-bold" style={{ color: 'var(--button-bg)' }}>
            {t('loginWarning')}
          </a>
        </p>
      )}
    </>
  );
}
