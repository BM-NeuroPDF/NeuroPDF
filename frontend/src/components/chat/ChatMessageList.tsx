'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import NeuroLogoIcon from '@/assets/icons/NeuroPDF-Chat.svg';
import type { RefObject } from 'react';
import type { ProChatMessage } from './proChatTypes';
import { getUserInitials } from './getUserInitials';

type ChatMessageListProps = {
  messages: ProChatMessage[];
  loading: boolean;
  initializing: boolean;
  activeInitializingLabel: string;
  activeTypingLabel: string;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  avatarSrc: string | null;
  userName: string;
};

export function ChatMessageList({
  messages,
  loading,
  initializing,
  activeInitializingLabel,
  activeTypingLabel,
  messagesEndRef,
  avatarSrc,
  userName,
}: ChatMessageListProps) {
  return (
    <div className="chat-messages-area relative flex-1 overflow-y-auto p-6 scrollbar-thin">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] dark:opacity-[0.05]">
        <Image src={NeuroLogoIcon} alt="Watermark" width={250} height={250} />
      </div>

      <div className="space-y-6 relative z-10 font-medium">
        {initializing && (
          <div className="flex flex-col items-center justify-center h-full py-20 opacity-50">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{
                repeat: Infinity,
                duration: 1,
                ease: 'linear',
              }}
              className="w-8 h-8 border-2 border-[var(--button-bg)] border-t-transparent rounded-full"
            />
            <p className="text-sm mt-4 font-bold">{activeInitializingLabel}</p>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {messages.map((msg, idx) => (
            <motion.div
              key={msg.id ?? `msg-${idx}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`flex max-w-[90%] gap-3 ${
                  msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-white border border-gray-100 shadow-sm overflow-hidden text-[10px] font-bold text-black">
                  {msg.role === 'user' ? (
                    avatarSrc ? (
                      <Image
                        src={avatarSrc}
                        alt="avatar"
                        width={32}
                        height={32}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="text-gray-600">{getUserInitials(userName)}</span>
                    )
                  ) : (
                    <Image src={NeuroLogoIcon} alt="AI" width={18} height={18} />
                  )}
                </div>

                <div
                  className={`chat-bubble ${
                    msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'
                  }`}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  {loading && idx === messages.length - 1 && msg.role === 'assistant' && (
                    <span className="inline-block w-2 h-4 ml-1 bg-current opacity-70 animate-pulse align-middle" />
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {loading && (
          <div className="flex items-center gap-2 text-xs opacity-50 animate-pulse font-bold">
            <div className="w-5 h-5 rounded-full flex items-center justify-center bg-white border border-gray-100 shadow-sm overflow-hidden">
              <Image src={NeuroLogoIcon} alt="AI" width={12} height={12} />
            </div>
            {activeTypingLabel}
          </div>
        )}
      </div>
      <div ref={messagesEndRef} />
    </div>
  );
}
