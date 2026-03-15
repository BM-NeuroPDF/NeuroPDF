"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

const STORAGE_KEY = "activePdfBase64";

export type Message = {
    role: "user" | "assistant";
    content: string;
};

interface PdfContextType {
    pdfFile: File | null;
    savePdf: (file: File | null) => Promise<void>;
    clearPdf: () => void;
    refreshKey: number;
    triggerRefresh: () => void;
    chatMessages: Message[];
    setChatMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    isChatActive: boolean;
    setIsChatActive: (val: boolean) => void;
    sessionId: string | null;
    setSessionId: (id: string | null) => void;
    proChatOpen: boolean;
    setProChatOpen: (v: boolean) => void;
    proChatPanelOpen: boolean;
    setProChatPanelOpen: (v: boolean) => void;
    generalChatMessages: Message[];
    setGeneralChatMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    generalSessionId: string | null;
    setGeneralSessionId: (id: string | null) => void;
}

const PdfContext = createContext<PdfContextType | undefined>(undefined);

export function PdfProvider({ children }: { children: ReactNode }) {
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    // PDF sohbet durumları
    const [chatMessages, setChatMessages] = useState<Message[]>([]);
    const [isChatActive, setIsChatActive] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [proChatOpen, setProChatOpen] = useState(false);
    // Genel ProChat panel + genel sohbet (navigasyonda korunur; clearPdf bunları temizlemez)
    const [proChatPanelOpen, setProChatPanelOpen] = useState(false);
    const [generalChatMessages, setGeneralChatMessages] = useState<Message[]>([]);
    const [generalSessionId, setGeneralSessionId] = useState<string | null>(null);

    useEffect(() => {
        try {
            const stored = sessionStorage.getItem(STORAGE_KEY);
            if (stored) {
                const byteString = atob(stored.split(",")[1]);
                const array = new Uint8Array(byteString.length);
                for (let i = 0; i < byteString.length; i++) array[i] = byteString.charCodeAt(i);
                const blob = new Blob([array], { type: "application/pdf" });
                setPdfFile(new File([blob], "restored_document.pdf", { type: "application/pdf" }));
            }
        } catch (e) {
            console.error("PDF kurtarma hatası:", e);
            sessionStorage.removeItem(STORAGE_KEY);
        }
    }, []);

    // ... context içindeki diğer state tanımları ...

    const savePdf = useCallback((file: File | null) => {
        return new Promise<void>((resolve) => {
            if (!file) {
                setPdfFile(null);
                sessionStorage.removeItem(STORAGE_KEY);
                setIsChatActive(false);
                setChatMessages([]);
                setSessionId(null);
                resolve();
                return;
            }

            // Dosya işleme mantığı
            if (typeof file.slice !== 'function') {
                resolve();
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const base64String = reader.result as string;
                    sessionStorage.setItem(STORAGE_KEY, base64String);
                } catch (storageError) {
                    console.warn("⚠️ PDF çok büyük, kaydedilemedi.");
                }
                setPdfFile(file);
                // Sadece yeni dosya yüklendiğinde yenileme anahtarını artır
                setRefreshKey((prev) => prev + 1);
                resolve();
            };
            reader.readAsDataURL(file);
        });
    }, []); // Bağımlılık dizisini boş bırakıyoruz

    const clearPdf = () => {
        setPdfFile(null);
        setIsChatActive(false);
        setChatMessages([]);
        setSessionId(null);
        sessionStorage.removeItem(STORAGE_KEY);
        setRefreshKey((prev) => prev + 1);
        // generalChatMessages, generalSessionId, proChatPanelOpen bilinçli olarak korunur
    };

    return (
        <PdfContext.Provider value={{
            pdfFile, savePdf, clearPdf, refreshKey, triggerRefresh: () => setRefreshKey(k => k + 1),
            chatMessages, setChatMessages, isChatActive, setIsChatActive, sessionId, setSessionId,
            proChatOpen, setProChatOpen,
            proChatPanelOpen, setProChatPanelOpen,
            generalChatMessages, setGeneralChatMessages,
            generalSessionId, setGeneralSessionId
        }}>
            {children}
        </PdfContext.Provider>
    );
}

export function usePdf() {
    const context = useContext(PdfContext);
    if (!context) throw new Error("usePdf must be used within a PdfProvider");
    return context;
}