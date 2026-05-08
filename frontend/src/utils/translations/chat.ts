export const chatTranslations = {
  tr: {
    // --- PDF CHAT ---
    chatWelcome: '👋 Merhaba! Dosyayı analiz ettim. Bana her şeyi sorabilirsin.',
    chatWelcomeGlobal: 'Merhaba ben Neuro AI. Sana yardımcı olmak için burdayım.',
    chatInitError: '🚫 Sohbet başlatılamadı.',
    chatConnError: '⚠️ Bağlantı hatası oluştu.',
    analyzing: 'Belge analiz ediliyor...',
    aiTyping: 'Neuro yanıt yazıyor...',
    chatPlaceholder: 'PDF hakkında bir soru sorun...',
    chatDisclaimer: 'NeuroPDF yapay zekası bazen hata yapabilir. Lütfen bilgileri kontrol edin.',
    errorOnlyPdf: 'Sadece PDF dosyaları yüklenebilir.',
    errorFileTooLarge: 'Dosya çok büyük (Maks {size}MB).',

    // --- PRO CHAT & GLOBAL CHAT ---
    chatInitializing: 'Başlatılıyor...',
    chatWelcomePdf:
      '👋 Merhaba! **"{name}"** dosyasını analiz ettim. Bana bu belgeyle ilgili her şeyi sorabilirsin.',
    chatWelcomeGeneral:
      '👋 Merhaba! Ben NeuroPDF AI asistanıyım. Size nasıl yardımcı olabilirim? PDF işlemleri, dosya yönetimi veya genel sorularınız için buradayım.',
    chatDropActive: "PDF'i Buraya Bırakın",
    chatListening: 'Dinleniyor...',
    chatVoiceInput: 'Sesli Giriş',
    chatAttachPdf: 'PDF Dosyası Yükle',
    chatVoiceAria: 'Sesli Yaz',
    chatPdfAria: 'PDF Ekle',
    chatErrorSessionExpired: "⚠️ PDF chat oturumu sona erdi. Lütfen PDF'i tekrar yükleyin.",
    chatErrorQuotaExceeded:
      '⚠️ Gemini API kotası aşıldı. Local LLM kullanmak için profil sayfasından ayarları değiştirin.',
    chatErrorConnection: '⚠️ Bağlantı hatası. Lütfen tekrar deneyin.',
    chatErrorSessionRefresh: '⚠️ Oturum yenilenemedi. Lütfen sayfayı yenileyin.',
    chatProRequiredTitle: 'Pro Üyelik Gerekli',
    chatProRequiredDesc:
      'AI sohbet özelliği Pro üyeliği gerektirir. Devam etmek için fiyatlandırma sayfasına gidebilirsiniz.',
    chatClose: 'Kapat',
    chatGoToPricing: 'Fiyatlandırmaya Git',
    chatHeaderPdf: 'PDF AI Asistanı',
    chatHeaderGeneral: 'Genel AI Asistanı',
    chatHeaderAnalysis: 'Analiz: {name}',
    chatSuggestionSummary: 'Bu belgenin özetini çıkar',
    chatSuggestionTranslate: 'Bu belgeyi İngilizceye çevir',
    chatSuggestionExtract: 'Bu belgenin sayfalarını ayır',
    chatSuggestionClear: 'Ekranı temizle',
    chatSuggestionMerge: 'Bu dosyaları birleştir',
  },
  en: {
    // --- PRO CHAT & GLOBAL CHAT ---
    chatInitializing: 'Initializing...',
    chatWelcomePdf:
      '👋 Hello! I have analyzed **"{name}"**. You can ask me anything about this document.',
    chatWelcomeGeneral:
      '👋 Hello! I am NeuroPDF AI assistant. How can I help you? I am here for PDF operations, file management, or general questions.',
    chatDropActive: 'Drop PDF Here',
    chatListening: 'Listening...',
    chatVoiceInput: 'Voice Input',
    chatAttachPdf: 'Upload PDF File',
    chatVoiceAria: 'Voice Input',
    chatPdfAria: 'Add PDF',
    chatErrorSessionExpired: '⚠️ PDF chat session expired. Please upload the PDF again.',
    chatErrorQuotaExceeded:
      '⚠️ Gemini API quota exceeded. Change settings in profile page to use Local LLM.',
    chatErrorConnection: '⚠️ Connection error. Please try again.',
    chatErrorSessionRefresh: '⚠️ Session could not be refreshed. Please refresh the page.',
    chatProRequiredTitle: 'Pro Membership Required',
    chatProRequiredDesc:
      'AI chat feature requires Pro membership. You can go to the pricing page to continue.',
    chatClose: 'Close',
    chatGoToPricing: 'Go to Pricing',
    chatHeaderPdf: 'PDF AI Assistant',
    chatHeaderGeneral: 'General AI Assistant',
    chatHeaderAnalysis: 'Analysis: {name}',
    chatSuggestionSummary: 'Summarize this document',
    chatSuggestionTranslate: 'Translate this document to English',
    chatSuggestionExtract: 'Extract pages of this document',
    chatSuggestionClear: 'Clear screen',
    chatSuggestionMerge: 'Merge these files',
  },
};
