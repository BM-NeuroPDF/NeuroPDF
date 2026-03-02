"use client";

import { useState } from "react";
import { usePdf } from "@/context/PdfContext";
import PdfChatPanel from "@/components/PdfChatPanel";
import { motion, AnimatePresence } from "framer-motion";

export default function GlobalPdfChat() {
  // Context'ten dosya ve sohbetin aktiflik durumunu çekiyoruz
  const { pdfFile, isChatActive } = usePdf();
  const [showChat, setShowChat] = useState(false);

  // KRİTİK KONTROL: Eğer dosya yoksa VEYA sohbet henüz başlatılmamışsa (isChatActive: false)
  // asistan butonu hiçbir sayfada görünmez.
  if (!pdfFile || !isChatActive) return null;

  return (
    <>
      {/* Yüzen Sohbet Butonu */}
      <AnimatePresence>
        {!showChat && (
          <motion.button
            initial={{ scale: 0, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0, opacity: 0, y: 20 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowChat(true)}
            // Z-index'i yüksek tutuyoruz ki EulaGuard veya Navbar üzerinde kalsın
            className="fixed bottom-6 right-6 z-[999] bg-indigo-600 text-white p-4 rounded-full shadow-[0_10px_40px_rgba(79,70,229,0.4)] border-2 border-white/20 group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.159 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
            
            {/* Tooltip: Kullanıcı üzerine gelince yardımcı metin çıkar */}
            <span className="absolute right-16 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-[10px] px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none font-bold tracking-wider shadow-xl border border-white/10">
              PDF İLE SOHBETE DEVAM ET
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Mesajları Context'ten alan global panel */}
      <PdfChatPanel 
        file={pdfFile} 
        isOpen={showChat} 
        onClose={() => setShowChat(false)} 
      />
    </>
  );
}