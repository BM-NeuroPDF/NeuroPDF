"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { sendRequest } from "@/utils/api";
import { useLanguage } from "@/context/LanguageContext";
import { usePdf } from "@/context/PdfContext";
import Image from "next/image";
import NeuroLogoIcon from "@/assets/icons/NeuroPDF-Chat.svg";
import ProChatPanel from "./ProChatPanel";

export default function ProGlobalChat() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();

  const {
    pdfFile,
    sessionId: pdfSessionId,
    chatMessages: pdfChatMessages,
    setChatMessages: setPdfChatMessages,
    setIsChatActive,
    setSessionId: setPdfSessionId,
    proChatOpen,
    setProChatOpen,
    proChatPanelOpen,
    setProChatPanelOpen,
    generalChatMessages,
    setGeneralChatMessages,
    generalSessionId,
    setGeneralSessionId,
  } = usePdf();

  const [userRole, setUserRole] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [showProRequiredModal, setShowProRequiredModal] = useState(false);

  const activeSessionId = pdfSessionId || generalSessionId;
  const activeChatMessages = pdfSessionId ? pdfChatMessages : generalChatMessages;
  const isPdfChat = !!pdfSessionId;
  const isProUser =
    userRole?.toLowerCase() === "pro" || userRole?.toLowerCase() === "pro user";
  const canAccessChat = status === "authenticated" && isProUser;

  // Başka sayfadan "Sohbet Et" ile açıldığında paneli aç
  useEffect(() => {
    if (proChatOpen) {
      setProChatPanelOpen(true);
      setProChatOpen(false);
    }
  }, [proChatOpen, setProChatOpen, setProChatPanelOpen]);

  // Dinamik PDF izleyici: pdfFile değiştiğinde Pro ise ve PDF oturumu yoksa arka planda /files/chat/start
  useEffect(() => {
    if (!pdfFile || !isProUser || pdfSessionId) return;
    let cancelled = false;
    (async () => {
      setInitializing(true);
      try {
        const formData = new FormData();
        formData.append("file", pdfFile);
        const chatRes = await sendRequest("/files/chat/start", "POST", formData, true);
        if (cancelled) return;
        if (chatRes?.session_id) {
          setPdfSessionId(chatRes.session_id);
          setIsChatActive(true);
          setPdfChatMessages([
            {
              role: "assistant",
              content: `👋 Merhaba! **"${pdfFile.name}"** dosyasını analiz ettim. Bana bu belgeyle ilgili her şeyi sorabilirsin.`,
            },
          ]);
        }
      } catch (e) {
        if (!cancelled) console.error("PDF chat otomatik başlatma hatası:", e);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfFile, isProUser, pdfSessionId, setPdfSessionId, setIsChatActive, setPdfChatMessages]);

  useEffect(() => {
    const fetchUserRole = async () => {
      if (status === "authenticated" && session) {
        try {
          const data = await sendRequest("/files/user/stats", "GET");
          setUserRole(data?.role ?? null);
        } catch (error: unknown) {
          const msg =
            error && typeof error === "object" && "message" in error
              ? String((error as { message?: string }).message)
              : "";
          if (
            msg.includes("Oturum süreniz dolmuş") ||
            msg.includes("expired") ||
            msg.includes("401")
          ) {
            setUserRole(null);
          } else {
            console.error("Rol kontrolü hatası:", error);
          }
        }
      }
    };
    fetchUserRole();
  }, [session, status]);

  const userId = (session?.user as { id?: string })?.id ?? null;

  useEffect(() => {
    if (!session?.user || !proChatPanelOpen) return;
    const uid = userId || "me";
    let cancelled = false;
    (async () => {
      try {
        const blob = (await sendRequest(
          `/api/v1/user/${uid}/avatar`,
          "GET"
        )) as Blob;
        if (cancelled) return;
        if (blob && blob.size > 0) {
          setAvatarSrc((prev) => {
            if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
          return;
        }
      } catch {
        /* fallback */
      }
      if (session?.user?.image) setAvatarSrc(session.user.image);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, proChatPanelOpen, session?.user]);

  const initChatSession = async () => {
    if (activeSessionId) return;
    setInitializing(true);
    try {
      const res = await sendRequest("/files/chat/general/start", "POST", {
        llm_provider: "cloud",
        mode: "flash",
      });
      if (!res.session_id) throw new Error("Oturum açılamadı.");
      setGeneralSessionId(res.session_id);
      setGeneralChatMessages([
        {
          role: "assistant",
          content:
            "👋 Merhaba! Ben NeuroPDF AI asistanıyım. Size nasıl yardımcı olabilirim? PDF işlemleri, dosya yönetimi veya genel sorularınız için buradayım.",
        },
      ]);
    } catch (e) {
      console.error("Chat başlatma hatası:", e);
      setGeneralChatMessages([
        {
          role: "assistant",
          content: "🚫 Sohbet başlatılamadı. Lütfen tekrar deneyin.",
        },
      ]);
    } finally {
      setInitializing(false);
    }
  };

  const handleFabClick = () => {
    if (status !== "authenticated") {
      router.push("/pricing");
      return;
    }
    if (!isProUser) {
      setShowProRequiredModal(true);
      return;
    }
    setProChatPanelOpen(true);
    if (!activeSessionId && !isPdfChat) {
      initChatSession();
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !activeSessionId) return;
    const userMsg = input.trim();
    setInput("");

    if (isPdfChat) {
      setPdfChatMessages((prev) => [
        ...prev,
        { role: "user", content: userMsg },
      ]);
    } else {
      setGeneralChatMessages((prev) => [
        ...prev,
        { role: "user", content: userMsg },
      ]);
    }
    setLoading(true);

    try {
      const endpoint = isPdfChat
        ? "/files/chat/message"
        : "/files/chat/general/message";
      const res = await sendRequest(endpoint, "POST", {
        session_id: activeSessionId,
        message: userMsg,
      });
      if (isPdfChat) {
        setPdfChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: res.answer },
        ]);
      } else {
        setGeneralChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: res.answer },
        ]);
      }
    } catch (e: unknown) {
      console.error("Chat mesaj hatası:", e);
      const errorMessage =
        e && typeof e === "object" && "message" in e
          ? String((e as { message?: string }).message)
          : String(e);

      if (
        errorMessage.includes("429") ||
        errorMessage.includes("kotası aşıldı") ||
        errorMessage.includes("quota") ||
        errorMessage.includes("Quota exceeded") ||
        errorMessage.includes("Gemini API")
      ) {
        const errorMsg =
          "⚠️ Gemini API kotası aşıldı. Local LLM kullanmak için profil sayfasından ayarları değiştirin.";
        if (isPdfChat) {
          setPdfChatMessages((prev) => [
            ...prev,
            { role: "assistant", content: errorMsg },
          ]);
        } else {
          setGeneralChatMessages((prev) => [
            ...prev,
            { role: "assistant", content: errorMsg },
          ]);
        }
        setLoading(false);
        return;
      }

      if (
        errorMessage.includes("Sohbet oturumu bulunamadı") ||
        errorMessage.includes("404") ||
        errorMessage.includes("session")
      ) {
        if (isPdfChat) {
          const errorMsg =
            "⚠️ PDF chat oturumu sona erdi. Lütfen PDF'i tekrar yükleyin.";
          setPdfChatMessages((prev) => [
            ...prev,
            { role: "assistant", content: errorMsg },
          ]);
        } else {
          try {
            const res = await sendRequest("/files/chat/general/start", "POST", {
              llm_provider: "cloud",
              mode: "flash",
            });
            if (res.session_id) {
              setGeneralSessionId(res.session_id);
              const retryRes = await sendRequest(
                "/files/chat/general/message",
                "POST",
                {
                  session_id: res.session_id,
                  message: userMsg,
                }
              );
              setGeneralChatMessages((prev) => [
                ...prev,
                { role: "assistant", content: retryRes.answer },
              ]);
            } else {
              throw new Error("Yeni session başlatılamadı");
            }
          } catch (retryError) {
            console.error("Session yenileme hatası:", retryError);
            setGeneralChatMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: "⚠️ Oturum yenilenemedi. Lütfen sayfayı yenileyin.",
              },
            ]);
          }
        }
      } else {
        const errorMsg = "⚠️ Bağlantı hatası. Lütfen tekrar deneyin.";
        if (isPdfChat) {
          setPdfChatMessages((prev) => [
            ...prev,
            { role: "assistant", content: errorMsg },
          ]);
        } else {
          setGeneralChatMessages((prev) => [
            ...prev,
            { role: "assistant", content: errorMsg },
          ]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* FAB: Her zaman görünür; tıklanınca erişim kontrolü */}
      <AnimatePresence>
        {!proChatPanelOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleFabClick}
            className="fixed bottom-6 right-6 z-[999] bg-indigo-600 text-white p-4 rounded-full shadow-[0_10px_40px_rgba(79,70,229,0.4)] border-2 border-white/20 group"
            aria-label="AI Asistanı"
          >
            <Image src={NeuroLogoIcon} alt="AI Chat" width={24} height={24} />
            <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              PRO
            </span>
            <span className="absolute right-16 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none font-bold shadow-xl">
              AI Asistanı
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Pro gerekli bilgilendirme modalı */}
      <AnimatePresence>
        {showProRequiredModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowProRequiredModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="rounded-2xl p-6 max-w-sm w-full shadow-xl border"
              style={{
                backgroundColor: "var(--background)",
                borderColor: "var(--container-border)",
              }}
            >
              <h3
                className="font-bold text-lg mb-2"
                style={{ color: "var(--foreground)" }}
              >
                Pro Üyelik Gerekli
              </h3>
              <p className="text-sm opacity-80 mb-6">
                AI sohbet özelliği Pro üyeliği gerektirir. Devam etmek için
                fiyatlandırma sayfasına gidebilirsiniz.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowProRequiredModal(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border font-medium transition-colors hover:opacity-90"
                  style={{
                    borderColor: "var(--container-border)",
                    color: "var(--foreground)",
                  }}
                >
                  Kapat
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowProRequiredModal(false);
                    router.push("/pricing");
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  Fiyatlandırmaya Git
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Panel: Sadece Pro ve giriş yapmış kullanıcıya açık; state context'te, sayfa geçişinde korunur */}
      {canAccessChat && (
        <ProChatPanel
          isOpen={proChatPanelOpen}
          onClose={() => setProChatPanelOpen(false)}
          messages={activeChatMessages}
          onSend={handleSend}
          loading={loading}
          initializing={initializing}
          input={input}
          setInput={setInput}
          headerTitle="Neuro AI"
          headerSubtitle={
            isPdfChat ? "PDF AI Asistanı" : "Genel AI Asistanı"
          }
          avatarSrc={avatarSrc}
          userName={session?.user?.name ?? "U"}
          placeholder={t("chatPlaceholder") || "Sorunuzu yazın..."}
          disclaimer={
            t("chatDisclaimer") ||
            "NeuroPDF yapay zekası bazen hata yapabilir. Lütfen bilgileri kontrol edin."
          }
          initializingLabel="Başlatılıyor..."
          typingLabel={t("aiTyping") || "Neuro yanıt yazıyor..."}
        />
      )}
    </>
  );
}
