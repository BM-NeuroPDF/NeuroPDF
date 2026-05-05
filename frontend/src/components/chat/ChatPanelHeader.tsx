'use client';

import Image from 'next/image';
import NeuroLogoIcon from '@/assets/icons/NeuroPDF-Chat.svg';

type ChatPanelHeaderProps = {
  headerTitle: string;
  headerSubtitle?: string;
  onClose: () => void;
};

export function ChatPanelHeader({ headerTitle, headerSubtitle, onClose }: ChatPanelHeaderProps) {
  return (
    <div
      className="flex items-center justify-between px-8 py-5 border-b relative z-10"
      style={{
        backgroundColor: 'var(--navbar-bg)',
        borderColor: 'var(--navbar-border)',
      }}
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-gray-100 shadow-sm overflow-hidden text-black">
            <Image src={NeuroLogoIcon} alt="AI Logo" width={28} height={28} />
          </div>
          <span
            className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 rounded-full"
            style={{ borderColor: 'var(--navbar-bg)' }}
          />
        </div>
        <div>
          <h3 className="font-bold leading-tight" style={{ color: 'var(--foreground)' }}>
            {headerTitle}
          </h3>
          {headerSubtitle && (
            <p className="text-xs opacity-60 truncate max-w-[180px]">{headerSubtitle}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        data-testid="chat-panel-close"
        aria-label="Close"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  );
}
