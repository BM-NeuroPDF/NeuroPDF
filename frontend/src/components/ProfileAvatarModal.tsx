'use client';

import type { Session } from 'next-auth';
import { useAvatarFlow } from './avatar/useAvatarFlow';
import { AvatarUploadStep } from './avatar/AvatarUploadStep';
import { AvatarGenerateStep } from './avatar/AvatarGenerateStep';
import { AvatarConfirmStep } from './avatar/AvatarConfirmStep';
import type { AvatarModalT } from './avatar/avatarTypes';

export interface ProfileAvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAvatarConfirmed: () => void | Promise<void>;
  session: Session | null;
  t: AvatarModalT;
}

export function ProfileAvatarModal({
  isOpen,
  onClose,
  onAvatarConfirmed,
  session,
  t,
}: ProfileAvatarModalProps) {
  const flow = useAvatarFlow(isOpen, session, onClose, onAvatarConfirmed, t);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[var(--container-bg)] text-[var(--foreground)] rounded-3xl shadow-2xl max-w-md w-full border border-[var(--navbar-border)] p-6 relative overflow-hidden flex flex-col max-h-[90vh]">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors z-10"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {flow.modalMode === 'select' && (
          <AvatarUploadStep
            t={t}
            uploading={flow.uploading}
            fileInputRef={flow.fileInputRef}
            onFileUpload={flow.handleFileUpload}
            onChooseGenerate={() => flow.setModalMode('generate')}
          />
        )}

        {flow.modalMode === 'generate' && (
          <>
            <AvatarGenerateStep
              onBack={() => flow.setModalMode('select')}
              generating={flow.generating}
              previewImage={flow.previewImage}
              referencePreview={flow.referencePreview}
              refInputRef={flow.refInputRef}
              onReferenceSelect={flow.handleReferenceSelect}
              onPickReference={() => flow.refInputRef.current?.click()}
              aiPrompt={flow.aiPrompt}
              setAiPrompt={flow.setAiPrompt}
              onGenerate={() => void flow.handleGenerateImage()}
              clearReference={flow.clearReference}
              showPromptForm={!flow.previewImage}
            />
            {flow.previewImage && (
              <AvatarConfirmStep
                confirming={flow.confirming}
                onRetry={() => flow.setPreviewImage(null)}
                onConfirm={() => void flow.handleConfirmAvatar()}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
