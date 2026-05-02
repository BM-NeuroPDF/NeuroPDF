'use client';

import { useRef, useState } from 'react';
import type { Session } from 'next-auth';
import { signOut } from 'next-auth/react';
import { sendRequest } from '@/utils/api';
import { translations } from '@/utils/translations';

export interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session | null;
  t: (key: keyof (typeof translations)['tr']) => string;
}

export function DeleteAccountModal({
  isOpen,
  onClose,
  session,
  t,
}: DeleteAccountModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteInFlightRef = useRef(false);

  if (!isOpen) return null;

  const handleCancel = () => {
    onClose();
  };

  const handleConfirm = async () => {
    if (!session?.user || deleteInFlightRef.current) return;
    deleteInFlightRef.current = true;
    setIsDeleting(true);
    try {
      await sendRequest('/auth/delete-account', 'DELETE');
      onClose();
      await signOut({ callbackUrl: '/' });
    } catch {
      alert(t('deleteAccountError') || 'Hata oluştu.');
      deleteInFlightRef.current = false;
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[var(--container-bg)] rounded-2xl shadow-2xl max-w-md w-full border border-[var(--navbar-border)] p-6">
        <div className="text-center">
          <h3 className="text-xl font-bold mb-2">
            {t('deleteAccountTitle') || 'Hesabınızı Silmek İstiyor musunuz?'}
          </h3>
          <p className="text-sm opacity-60 mb-6">
            {t('deleteAccountWarning') || 'Bu işlem geri alınamaz.'}
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isDeleting}
            className="btn-secondary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('cancel') || 'Vazgeç'}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isDeleting}
            className="btn-danger flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('confirmDelete') || 'Sil'}
          </button>
        </div>
      </div>
    </div>
  );
}
