export const errorsTranslations = {
  tr: {
    // --- TOASTS ---
    toastInvalidRange: 'Geçersiz sayfa aralığı.',
    toastPdfRequired: 'Tarayıcıda kesim için açık bir PDF gerekir. Lütfen bir dosya yükleyin.',
    toastPagesInvalid: 'Sayfa numaraları geçersiz.',
    toastPdfLimit: 'PDF yalnızca {count} sayfa içeriyor.',
    toastExtractSuccess: 'Sayfalar başarıyla ayrıldı ve ekrana yüklendi.',
    toastExtractError: 'PDF kesilemedi. Lütfen tekrar deneyin.',
    toastMergeMinFiles:
      'Birleştirmek için en az iki PDF gerekir. Lütfen yan panele birden fazla dosya ekleyin.',
    toastMergeSuccess: 'Tüm PDF dosyaları başarıyla birleştirildi',
    toastMergeError: 'PDF birleştirilemedi. Lütfen dosyaları kontrol edip tekrar deneyin.',
    toastClearSuccess: 'Ekrandaki tüm dosyalar temizlendi.',
    toastSwapSuccess: 'Sayfalar yer değiştirildi; PDF güncellendi.',
    toastSwapError: 'Sayfa yer değiştirme başarısız.',
    toastMicErrorNoSpeech: 'Ses algılanamadı, mikrofonu kontrol edin.',
    toastMicErrorNotAllowed: 'Mikrofon izni reddedildi.',
    toastMicErrorNetwork:
      'Ses tanıma sunucusuna güvenli bağlantı kurulamadı. Chrome kullandığınızdan veya internet bağlantınızdan emin olun.',
  },
  en: {
    // --- TOASTS ---
    toastInvalidRange: 'Invalid page range.',
    toastPdfRequired: 'A PDF must be open in the browser for cutting. Please upload a file.',
    toastPagesInvalid: 'Page numbers are invalid.',
    toastPdfLimit: 'PDF only contains {count} pages.',
    toastExtractSuccess: 'Pages extracted successfully and loaded to screen.',
    toastExtractError: 'Could not cut PDF. Please try again.',
    toastMergeMinFiles:
      'At least two PDFs are required to merge. Please add multiple files to the side panel.',
    toastMergeSuccess: 'All PDF files merged successfully',
    toastMergeError: 'Could not merge PDF. Please check the files and try again.',
    toastClearSuccess: 'All files on the screen have been cleared.',
    toastSwapSuccess: 'Pages swapped; PDF updated.',
    toastSwapError: 'Page swap failed.',
    toastMicErrorNoSpeech: 'No sound detected, check your microphone.',
    toastMicErrorNotAllowed: 'Microphone permission denied.',
    toastMicErrorNetwork:
      'Could not establish secure connection to speech recognition server. Ensure you are using Chrome or check your internet connection.',
  },
};
