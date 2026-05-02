'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import NeuroLogoIcon from '@/assets/icons/NeuroPDF-Chat.svg';

type ProGlobalChatFabProps = {
  isOpen: boolean;
  onToggle: () => void;
  showProRequiredModal: boolean;
  onCloseProModal: () => void;
  onGoToPricing: () => void;
  fabAriaLabel: string;
  welcomeText: string;
  proRequiredTitle: string;
  proRequiredDesc: string;
  closeText: string;
  goToPricingText: string;
  isRoleLoading?: boolean;
  avatarSrc?: string | null;
};

export default function ProGlobalChatFab({
  isOpen,
  onToggle,
  showProRequiredModal,
  onCloseProModal,
  onGoToPricing,
  fabAriaLabel,
  welcomeText,
  proRequiredTitle,
  proRequiredDesc,
  closeText,
  goToPricingText,
  avatarSrc = null,
}: ProGlobalChatFabProps) {
  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <div className="fixed bottom-6 right-6 z-[999] flex flex-col items-end gap-3">
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.8 }}
              transition={{ delay: 1, duration: 0.4, type: 'spring' }}
              className="bg-[var(--container-bg)] text-[var(--foreground)] px-4 py-2.5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-[var(--container-border)] font-bold text-sm relative mb-1 mr-1 pointer-events-none group-hover:scale-105 transition-transform origin-bottom-right max-w-[min(90vw,18rem)] whitespace-normal break-words"
            >
              <div className="flex items-start gap-2">
                <span className="text-lg leading-5">✨</span>
                <span
                  className="leading-5 overflow-hidden"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {welcomeText}
                </span>
              </div>
              <div className="absolute -bottom-[6px] right-7 w-3 h-3 bg-[var(--container-bg)] border-r border-b border-[var(--container-border)] rotate-45" />
            </motion.div>

            <motion.button
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              whileHover={{ scale: 1.1, rotate: 2 }}
              whileTap={{ scale: 0.9 }}
              onClick={onToggle}
              className="p-2 rounded-full group relative flex items-center justify-center bg-transparent hover:bg-[var(--container-bg)]/50 transition-colors border-0 shadow-none"
              aria-label={fabAriaLabel}
              data-testid="global-chat-fab"
            >
              <div className="relative z-10">
                {avatarSrc ? (
                  <Image
                    src={avatarSrc}
                    alt="avatar"
                    width={32}
                    height={32}
                    className="rounded-full object-cover drop-shadow-sm w-10 h-10"
                    unoptimized
                  />
                ) : (
                  <Image
                    src={NeuroLogoIcon}
                    alt="AI Chat"
                    width={40}
                    height={40}
                    className="drop-shadow-sm brightness-100 dark:brightness-110"
                  />
                )}
              </div>
            </motion.button>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProRequiredModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={onCloseProModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="rounded-2xl p-6 max-w-sm w-full shadow-xl border"
              style={{
                backgroundColor: 'var(--background)',
                borderColor: 'var(--container-border)',
              }}
            >
              <h3
                className="font-bold text-lg mb-2"
                style={{ color: 'var(--foreground)' }}
              >
                {proRequiredTitle}
              </h3>
              <p className="text-sm opacity-80 mb-6">{proRequiredDesc}</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onCloseProModal}
                  className="flex-1 py-2.5 px-4 rounded-xl border font-medium transition-colors hover:opacity-90"
                  style={{
                    borderColor: 'var(--container-border)',
                    color: 'var(--foreground)',
                  }}
                >
                  {closeText}
                </button>
                <button
                  type="button"
                  onClick={onGoToPricing}
                  className="flex-1 py-2.5 px-4 rounded-xl font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  {goToPricingText}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
