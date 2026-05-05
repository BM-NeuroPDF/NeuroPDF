'use client';

import UsageLimitModal from '@/components/UsageLimitModal';
import Popup from '@/components/ui/Popup';
import type { UsageInfo } from '@/hooks/useGuestLimit';

type EditPdfDialogsProps = {
  showLimitModal: boolean;
  onCloseLimitModal: () => void;
  onLogin: () => void;
  usageInfo: UsageInfo | null;
  popup: {
    open: boolean;
    type: 'error' | 'info' | 'success';
    message: string;
  };
  onClosePopup: () => void;
};

export default function EditPdfDialogs({
  showLimitModal,
  onCloseLimitModal,
  onLogin,
  usageInfo,
  popup,
  onClosePopup,
}: EditPdfDialogsProps) {
  return (
    <>
      <UsageLimitModal
        isOpen={showLimitModal}
        onClose={onCloseLimitModal}
        onLogin={onLogin}
        usageCount={usageInfo?.usage_count}
        maxUsage={3}
      />
      <Popup type={popup.type} message={popup.message} open={popup.open} onClose={onClosePopup} />
    </>
  );
}
