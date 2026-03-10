"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { sendRequest } from "@/utils/api";
import { useLanguage } from "@/context/LanguageContext";
import { usePdf } from "@/context/PdfContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Image from "next/image";
import NeuroLogoIcon from "@/assets/icons/NeuroPDF-Chat.svg";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function ProGlobalChat() {
  const { data: session, status } = useSession();
  const { t } = useLanguage();
  
  // ✅ PDF Context'ten PDF chat session'ını al
  const { sessionId: pdfSessionId, chatMessages: pdfChatMessages, setChatMessages: setPdfChatMessages, isChatActive } = usePdf();
  
  const [isMinimized, setIsMinimized] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // ✅ PDF chat session'ı varsa onu kullan, yoksa genel chat başlat
  const activeSessionId = pdfSessionId || sessionId;
  const activeChatMessages = pdfSessionId ? pdfChatMessages : chatMessages;
  const isPdfChat = !!pdfSessionId;

  // Mesajlar değiştikçe en alta kaydır
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeChatMessages, loading]);

  // Kullanıcı rolünü kontrol et
  useEffect(() => {
    const fetchUserRole = async () => {
      if (status === "authenticated" && session) {
        try {
          const data = await sendRequest("/files/user/stats", "GET");
          setUserRole(data?.role || null);
        } catch (error: any) {
          // Token expired durumunda sendRequest zaten yönlendirme yapacak
          // Burada sadece component'i gizle
          if (error?.message?.includes("Oturum süreniz dolmuş") || error?.message?.includes("expired") || error?.message?.includes("401")) {
            setUserRole(null);
            // sendRequest zaten yönlendirme yaptı, burada ek işlem yapmaya gerek yok
          } else {
            console.error("Rol kontrolü hatası:", error);
          }
        }
      }
    };
    fetchUserRole();
  }, [session, status]);

  // ✅ PDF chat session'ı varsa onu kullan
  useEffect(() => {
    if (pdfSessionId && isChatActive && pdfChatMessages.length > 0) {
      // PDF chat session'ı aktif, mesajlar zaten yüklenmiş
      // Sadece chat'i açık tut
    }
  }, [pdfSessionId, isChatActive, pdfChatMessages]);

  // Avatar çekme
  useEffect(() => {
    const fetchAvatar = async () => {
      if (session?.user && !isMinimized) {
        try {
          const userId = (session.user as any).id || "me";
          // sendRequest kullanarak avatar'ı çek (blob döndürür)
          const blob = await sendRequest(`/api/v1/user/${userId}/avatar`, "GET") as Blob;
          if (blob && blob.size > 0) {
            setAvatarSrc(URL.createObjectURL(blob));
          } else if (session.user.image) {
            setAvatarSrc(session.user.image);
          }
        } catch (e) {
          // Avatar çekilemezse fallback olarak session'daki image'i kullan
          if (session.user.image) {
            setAvatarSrc(session.user.image);
          }
        }
      }
    };
    fetchAvatar();
  }, [session, isMinimized]);

  // Pro kullanıcı değilse gösterilme
  const isProUser = userRole?.toLowerCase() === "pro" || userRole?.toLowerCase() === "pro user";
  if (status !== "authenticated" || !isProUser) return null;

  const initChatSession = async () => {
    if (activeSessionId) return; // Zaten başlatılmış (PDF veya genel chat)
    
    setInitializing(true);
    try {
      const res = await sendRequest("/files/chat/general/start", "POST", {
        llm_provider: "cloud",
        mode: "flash"
      });
      
      if (!res.session_id) throw new Error("Oturum açılamadı.");
      
      setSessionId(res.session_id);
      setChatMessages([{ 
        role: "assistant", 
        content: "👋 Merhaba! Ben NeuroPDF AI asistanıyım. Size nasıl yardımcı olabilirim? PDF işlemleri, dosya yönetimi veya genel sorularınız için buradayım." 
      }]);
    } catch (e) {
      console.error("Chat başlatma hatası:", e);
      setChatMessages([{ role: "assistant", content: "🚫 Sohbet başlatılamadı. Lütfen tekrar deneyin." }]);
    } finally {
      setInitializing(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !activeSessionId) return;
    const userMsg = input.trim();
    setInput("");
    
    // Mesajı doğru state'e ekle
    if (isPdfChat) {
      setPdfChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    } else {
      setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    }
    setLoading(true);
    
    try {
      // PDF chat ise PDF chat endpoint'ini kullan, değilse genel chat
      const endpoint = isPdfChat ? "/files/chat/message" : "/files/chat/general/message";
      const res = await sendRequest(endpoint, "POST", {
        session_id: activeSessionId,
        message: userMsg,
      });
      
      // Cevabı doğru state'e ekle
      if (isPdfChat) {
        setPdfChatMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
      } else {
        setChatMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
      }
    } catch (e: any) {
      console.error("Chat mesaj hatası:", e);
      
      // Session kaybolduysa (404) otomatik olarak yeni session başlat
      if (e?.message?.includes("Sohbet oturumu bulunamadı") || e?.message?.includes("404") || e?.message?.includes("session")) {
        console.log("Session kayboldu, yeni session başlatılıyor...");
        
        // PDF chat ise, PDF chat'i yeniden başlatamayız (PDF yok)
        if (isPdfChat) {
          const errorMsg = "⚠️ PDF chat oturumu sona erdi. Lütfen PDF'i tekrar yükleyin.";
          setPdfChatMessages((prev) => [...prev, { role: "assistant", content: errorMsg }]);
        } else {
          // Genel chat için yeni session başlat
          try {
            const res = await sendRequest("/files/chat/general/start", "POST", {
              llm_provider: "cloud",
              mode: "flash"
            });
            
            if (res.session_id) {
              setSessionId(res.session_id);
              // Mesajı yeni session ile tekrar gönder
              const retryRes = await sendRequest("/files/chat/general/message", "POST", {
                session_id: res.session_id,
                message: userMsg,
              });
              setChatMessages((prev) => [...prev, { role: "assistant", content: retryRes.answer }]);
            } else {
              throw new Error("Yeni session başlatılamadı");
            }
          } catch (retryError) {
            console.error("Session yenileme hatası:", retryError);
            const errorMsg = "⚠️ Oturum yenilenemedi. Lütfen sayfayı yenileyin.";
            setChatMessages((prev) => [...prev, { role: "assistant", content: errorMsg }]);
          }
        }
      } else {
        // Diğer hatalar için genel hata mesajı
        const errorMsg = "⚠️ Bağlantı hatası. Lütfen tekrar deneyin.";
        if (isPdfChat) {
          setPdfChatMessages((prev) => [...prev, { role: "assistant", content: errorMsg }]);
        } else {
          setChatMessages((prev) => [...prev, { role: "assistant", content: errorMsg }]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return "U";
    return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  };

  return (
    <>
      {/* Minimize Edilmiş İkon (Sağ Alt Köşe) */}
      <AnimatePresence>
        {isMinimized && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              setIsMinimized(false);
              // PDF chat session'ı varsa onu kullan, yoksa genel chat başlat
              if (!activeSessionId && !isPdfChat) {
                initChatSession();
              }
            }}
            className="fixed bottom-6 right-6 z-[999] bg-indigo-600 text-white p-4 rounded-full shadow-[0_10px_40px_rgba(79,70,229,0.4)] border-2 border-white/20 group"
          >
            <Image src={NeuroLogoIcon} alt="AI Chat" width={24} height={24} />
            
            {/* Badge: Pro */}
            <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              PRO
            </span>
            
            {/* Tooltip */}
            <span className="absolute right-16 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none font-bold shadow-xl">
              AI Asistanı
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {!isMinimized && (
          <>
            {/* Backdrop (Mobil) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMinimized(true)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[110] sm:hidden"
            />

            <motion.div
              initial={{ x: "100%", opacity: 0.5 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0.5 }}
              transition={{ type: "spring", stiffness: 260, damping: 25 }}
              className="fixed top-[64px] right-2 bottom-2 w-full sm:w-[480px] z-[120] flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.1)] overflow-hidden rounded-l-[2rem] rounded-r-lg"
              style={{ 
                backgroundColor: "var(--background)", 
                border: "1px solid var(--container-border)" 
              }}
            >
              {/* Header */}
              <div 
                className="flex items-center justify-between px-8 py-5 border-b relative z-10"
                style={{ backgroundColor: "var(--navbar-bg)", borderColor: "var(--navbar-border)" }}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-gray-100 shadow-sm overflow-hidden">
                      <Image src={NeuroLogoIcon} alt="AI Logo" width={28} height={28} />
                    </div>
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 rounded-full" style={{ borderColor: "var(--navbar-bg)" }}></span>
                  </div>
                  <div>
                    <h3 className="font-bold leading-tight flex items-center gap-2" style={{ color: "var(--foreground)" }}>
                      Neuro AI
                      <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">PRO</span>
                    </h3>
                    <p className="text-xs opacity-60">{isPdfChat ? "PDF AI Asistanı" : "Genel AI Asistanı"}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsMinimized(true)} 
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                  </svg>
                </button>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                <div className="space-y-6">
                  {initializing && (
                    <div className="flex flex-col items-center justify-center py-20 opacity-50">
                      <motion.div 
                        animate={{ rotate: 360 }} 
                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }} 
                        className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" 
                      />
                      <p className="text-sm mt-4 font-bold">Başlatılıyor...</p>
                    </div>
                  )}

                  <AnimatePresence mode="popLayout">
                    {activeChatMessages.map((msg, idx) => (
                      <motion.div 
                        key={idx} 
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div className={`flex max-w-[90%] gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                          {/* Avatar */}
                          <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-white border border-gray-100 shadow-sm overflow-hidden text-[10px] font-bold text-black">
                            {msg.role === "user" ? (
                              avatarSrc ? (
                                <img src={avatarSrc} className="w-full h-full object-cover" alt="U" />
                              ) : (
                                <span className="text-gray-600">{getInitials(session?.user?.name || "U")}</span>
                              )
                            ) : (
                              <Image src={NeuroLogoIcon} alt="AI" width={18} height={18} />
                            )}
                          </div>

                          {/* Message Bubble */}
                          <div className={`rounded-2xl px-4 py-3 ${
                            msg.role === "user" 
                              ? "bg-indigo-600 text-white" 
                              : "bg-gray-100 dark:bg-gray-800"
                          }`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  
                  {loading && (
                    <div className="text-xs opacity-50 animate-pulse font-bold">
                      {t('aiTyping') || "Neuro yanıt yazıyor..."}
                    </div>
                  )}
                </div>
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-4 relative z-10" style={{ backgroundColor: "var(--navbar-bg)", borderTop: "1px solid var(--navbar-border)" }}>
                <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={t('chatPlaceholder') || "Sorunuzu yazın..."}
                    disabled={loading || initializing}
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <motion.button 
                    whileTap={{ scale: 0.9 }} 
                    type="submit" 
                    disabled={!input.trim() || loading || initializing} 
                    className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>
                    </svg>
                  </motion.button>
                </form>
                
                <p className="text-[10px] text-center mt-3 opacity-40 leading-tight">
                  {t('chatDisclaimer') || "NeuroPDF yapay zekası bazen hata yapabilir. Lütfen bilgileri kontrol edin."}
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
