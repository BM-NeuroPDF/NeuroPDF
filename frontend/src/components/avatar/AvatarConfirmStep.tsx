'use client';

type AvatarConfirmStepProps = {
  confirming: boolean;
  onRetry: () => void;
  onConfirm: () => void;
};

export function AvatarConfirmStep({ confirming, onRetry, onConfirm }: AvatarConfirmStepProps) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onRetry}
        className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-700 font-semibold hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
      >
        Tekrar Dene
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={confirming}
        className="flex-1 py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
      >
        {confirming ? 'Kaydediliyor...' : 'Bu Resmi Kullan'}
      </button>
    </div>
  );
}
