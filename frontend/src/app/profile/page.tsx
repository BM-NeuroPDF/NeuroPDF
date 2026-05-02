'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import useSWR from 'swr';
import { useLanguage } from '@/context/LanguageContext';
import { sendRequest, swrFetcher } from '@/utils/api';
import { usePdf } from '@/context/PdfContext';
import { useProfileAvatar } from '@/hooks/useProfileAvatar';
import { DeleteAccountModal } from '@/components/DeleteAccountModal';
import {
  LlmPreferenceCard,
  type LlmChoiceData,
} from '@/components/LlmPreferenceCard';
import { ProfileHeroCard } from '@/components/ProfileHeroCard';
import { ProfileStatsCards } from '@/components/ProfileStatsCards';
import { AccountSettingsSection } from '@/components/AccountSettingsSection';

// Session user tipini genişletelim (id'ye erişim için)
interface ExtendedUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const user = session?.user as ExtendedUser | undefined;
  const router = useRouter();
  const { t } = useLanguage();
  const { savePdf } = usePdf();

  const [mounted, setMounted] = useState(false);

  const { avatarSrc, fetchUserAvatar } = useProfileAvatar({
    status,
    user,
  });

  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Avatar Modal State'leri
  const [showImageModal, setShowImageModal] = useState(false);
  const [modalMode, setModalMode] = useState<'select' | 'generate'>('select');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ✅ YENİ: AI Referans Resim State'leri
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  // AI Generate State'leri
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [tempAvatarId, setTempAvatarId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    savePdf(null);
  }, [savePdf]);

  useEffect(() => {
    setMounted(true);
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const { data: statsData } = useSWR<{
    summary_count: number;
    tools_count: number;
    role: string;
  }>(status === 'authenticated' ? '/files/user/stats' : null, swrFetcher);

  const { data: llmData, mutate: mutateLlm } = useSWR<LlmChoiceData>(
    status === 'authenticated' ? '/files/user/llm-choice' : null,
    swrFetcher
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'image/png') {
      alert(t('onlyPngAllowed') || 'Sadece PNG dosyaları yüklenebilir.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const userId = user?.id || 'me';

      await sendRequest(
        `/api/v1/user/${userId}/avatar`,
        'POST',
        formData,
        true // isFileUpload
      );

      alert(t('imageUploadSuccess') || 'Profil resmi güncellendi!');
      setShowImageModal(false);

      // ✅ 3. ADIM: Yükleme bitince avatarı backend'den tekrar çekip yenile
      await fetchUserAvatar();
    } catch (error) {
      console.error('Yükleme hatası:', error);
      alert(t('imageUploadError') || 'Yükleme başarısız.');
    } finally {
      setUploading(false);
    }
  };

  // ✅ YENİ: Referans Resim Seçme (SADECE PNG KONTROLÜ)
  const handleReferenceSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Sadece PNG kontrolü
    if (file.type !== 'image/png') {
      alert('Referans resim sadece PNG formatında olabilir.');
      // Input değerini temizle ki aynı dosyayı tekrar seçerse event tetiklensin
      e.target.value = '';
      return;
    }

    setReferenceImage(file);
    setReferencePreview(URL.createObjectURL(file));
  };

  const handleGenerateImage = async () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    setPreviewImage(null);
    setTempAvatarId(null);

    try {
      const userId = user?.id || 'me';

      let resData;

      // ✅ DURUM 1: Referans Resim VARSA -> /edit endpointine Multipart gönder
      if (referenceImage) {
        const formData = new FormData();
        formData.append('file', referenceImage);
        formData.append('prompt', aiPrompt);

        // Fetch kullanıyoruz çünkü sendRequest JSON varsayıyor olabilir
        resData = await sendRequest(
          `/api/v1/user/${userId}/avatar/edit`,
          'POST',
          formData,
          true // isFileUpload
        );
      }
      // ✅ DURUM 2: Referans Resim YOKSA -> /generate endpointine JSON gönder
      else {
        resData = await sendRequest(
          `/api/v1/user/${userId}/avatar/generate`,
          'POST',
          {
            prompt: aiPrompt,
          }
        );
      }

      if (resData.preview_image && resData.temp_avatar_id) {
        setPreviewImage(resData.preview_image);
        setTempAvatarId(resData.temp_avatar_id);
      }
    } catch (error) {
      console.error('Generate error:', error);
      alert('Resim oluşturulamadı.');
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirmAvatar = async () => {
    if (!tempAvatarId) return;
    setConfirming(true);
    try {
      const userId = user?.id || 'me';
      await sendRequest(`/api/v1/user/${userId}/avatar/confirm`, 'POST', {
        temp_avatar_id: tempAvatarId,
      });

      alert('Yeni avatarınız kaydedildi!');
      // Temizlik
      resetModal();

      // ✅ 4. ADIM: Onaylanınca avatarı yenile
      await fetchUserAvatar();
    } catch (error) {
      console.error('Confirm error:', error);
      alert('Hata oluştu.');
    } finally {
      setConfirming(false);
    }
  };

  const handleRequestDelete = () => setShowConfirmModal(true);

  const resetModal = () => {
    setShowImageModal(false);
    setTimeout(() => {
      setModalMode('select');
      setPreviewImage(null);
      setAiPrompt('');
      setReferenceImage(null);
      setReferencePreview(null);
    }, 300);
  };

  if (!mounted || status === 'loading') {
    return (
      <div className="min-h-screen p-6 max-w-4xl mx-auto flex flex-col gap-6 pt-24">
        <div className="h-48 w-full bg-[var(--container-bg)] animate-pulse rounded-3xl border border-[var(--navbar-border)]"></div>
      </div>
    );
  }

  if (!session?.user) return null;

  const stats = statsData ?? {
    summary_count: 0,
    tools_count: 0,
    role: 'Standart',
  };

  const userPlan = stats.role || t('standardAccount') || 'Standart Hesap';

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto font-bold text-[var(--foreground)] pt-24 relative">
      <DeleteAccountModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        session={session ?? null}
        t={t}
      />

      {/* 🔵 AVATAR MODALI */}
      {showImageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--container-bg)] text-[var(--foreground)] rounded-3xl shadow-2xl max-w-md w-full border border-[var(--navbar-border)] p-6 relative overflow-hidden flex flex-col max-h-[90vh]">
            <button
              onClick={resetModal}
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            {modalMode === 'select' && (
              <div className="animate-in slide-in-from-left-4 duration-300">
                <div className="text-center mb-8 mt-2">
                  <div className="w-20 h-20 mx-auto bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-purple-500/20">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-10 h-10 text-white"
                    >
                      <path d="M12 9a3.75 3.75 0 100 7.5A3.75 3.75 0 0012 9z" />
                      <path
                        fillRule="evenodd"
                        d="M9.344 3.071a4.993 4.993 0 015.312 0l.208.107a.6.6 0 01.394.537l.12 1.637c.042.569.458 1.031 1.01 1.13l1.58.283a.6.6 0 01.492.684l-.326 1.956a2.022 2.022 0 01-.137.49l-.57 1.425a.6.6 0 01-.795.26l-1.63-.815a1.5 1.5 0 00-1.892 2.012l.617 1.628a.6.6 0 01-.17.72l-1.503 1.127a2.003 2.003 0 01-2.398 0l-1.503-1.127a.6.6 0 01-.17-.72l.617-1.628a1.5 1.5 0 00-1.892-2.012l-1.63.815a.6.6 0 01-.795-.26l-.57-1.425a2.022 2.022 0 01-.137-.49l-.326-1.956a.6.6 0 01.492-.684l1.58-.283a1.2 1.2 0 001.01-1.13l.12-1.637a.6.6 0 01.394-.537l.208-.107zM7.5 12.75a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold">
                    {t('changeProfileImage') || 'Profil Resmini Değiştir'}
                  </h3>
                  <p className="text-sm opacity-60 mt-1">
                    {t('chooseImageOption') ||
                      'Yeni bir görünüm için yöntem seçin.'}
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Dosya Yükle */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full group relative flex items-center p-4 rounded-2xl border border-[var(--navbar-border)] hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-left"
                  >
                    <input
                      type="file"
                      accept="image/png"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <div className="p-3 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 group-hover:scale-110 transition-transform">
                      {uploading ? (
                        <svg
                          className="animate-spin h-6 w-6"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="w-6 h-6"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                          />
                        </svg>
                      )}
                    </div>
                    <div className="ml-4">
                      <p className="font-bold text-lg">
                        {t('uploadPng') || 'PNG Yükle'}
                      </p>
                      <p className="text-xs opacity-60">
                        {t('uploadPngHint') || 'Cihazınızdan bir dosya seçin.'}
                      </p>
                    </div>
                  </button>

                  {/* AI ile Oluştur */}
                  <button
                    onClick={() => setModalMode('generate')}
                    className="w-full group relative flex items-center p-4 rounded-2xl border border-[var(--navbar-border)] hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-all text-left"
                  >
                    <div className="p-3 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 group-hover:scale-110 transition-transform">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-6 h-6"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 00-1.423 1.423z"
                        />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <p className="font-bold text-lg">
                        {t('generateWithAI') || 'AI ile Oluştur'}
                      </p>
                      <p className="text-xs opacity-60">
                        {t('generateWithAIHint') ||
                          'Yapay zeka ile size özel bir avatar.'}
                      </p>
                    </div>
                    <div className="absolute top-4 right-4 px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-full">
                      NEW
                    </div>
                  </button>
                </div>
              </div>
            )}

            {modalMode === 'generate' && (
              <div className="animate-in slide-in-from-right-4 duration-300 flex flex-col h-full">
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={() => setModalMode('select')}
                    className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        fillRule="evenodd"
                        d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                  <h3 className="text-lg font-bold">AI Avatar Studio</h3>
                </div>

                {/* Önizleme Alanı */}
                <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-black/20 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 mb-4 min-h-[250px] relative overflow-hidden">
                  {generating ? (
                    <div className="text-center">
                      <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-sm font-medium animate-pulse text-purple-500">
                        Sihir yapılıyor...
                      </p>
                    </div>
                  ) : previewImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={previewImage}
                      alt="AI Preview"
                      className="w-full h-full object-contain animate-in zoom-in duration-300"
                    />
                  ) : (
                    <div className="text-center opacity-40 p-6">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1}
                        stroke="currentColor"
                        className="w-16 h-16 mx-auto mb-2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 00-1.423 1.423z"
                        />
                      </svg>
                      <p className="text-sm">
                        Bir açıklama yazın ve avatarınızı oluşturun.
                      </p>
                    </div>
                  )}
                </div>

                {!previewImage ? (
                  <div className="flex flex-col gap-2">
                    {/* ✅ YENİ: Referans Resim Ekleme Alanı (SADECE PNG) */}
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        onClick={() => refInputRef.current?.click()}
                        className="text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 transition-colors"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-3.5 h-3.5"
                        >
                          <path
                            fillRule="evenodd"
                            d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.22-2.219a.75.75 0 00-1.06 0l-1.91 1.909.47.47a.75.75 0 11-1.06 1.06L6.53 8.091a.75.75 0 00-1.06 0l-2.97 2.97zM12 7a1 1 0 11-2 0 1 1 0 012 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {referencePreview
                          ? 'Fotoğrafı Değiştir'
                          : '📸 Fotoğraf Ekle (Referans)'}
                      </button>

                      {/* ✅ SADECE PNG KABUL EDİYOR */}
                      <input
                        type="file"
                        accept="image/png"
                        ref={refInputRef}
                        onChange={handleReferenceSelect}
                        className="hidden"
                      />

                      {referencePreview && (
                        <div className="relative w-8 h-8 rounded overflow-hidden border border-gray-300 dark:border-gray-600 group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={referencePreview}
                            className="w-full h-full object-cover"
                            alt="ref"
                          />
                          <button
                            onClick={() => {
                              setReferenceImage(null);
                              setReferencePreview(null);
                            }}
                            className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              className="w-4 h-4"
                            >
                              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder={
                          referenceImage
                            ? 'Fotoğrafta neyi değiştireyim? (Örn: Gözlük tak)'
                            : 'Örn: Mavi gözlü, kask takan fütüristik kedi...'
                        }
                        className="flex-1 bg-gray-100 dark:bg-white/5 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-purple-500 outline-none"
                        onKeyDown={(e) =>
                          e.key === 'Enter' && handleGenerateImage()
                        }
                      />
                      <button
                        onClick={handleGenerateImage}
                        disabled={generating || !aiPrompt.trim()}
                        className="bg-purple-600 text-white p-3 rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="w-6 h-6"
                        >
                          <path
                            fillRule="evenodd"
                            d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436h.671A3.375 3.375 0 0120.462 18v.416a1.5 1.5 0 01-1.5 1.5h-5.996a1.5 1.5 0 01-1.5-1.5V18a3.375 3.375 0 013.375-3.375h.67C12.436 10.941 7.935 8.558 2.879 8.558a.75.75 0 01-.75-.75c0-5.055 2.383-9.555 6.084-12.436h-.671A3.375 3.375 0 014.217 1.5V1.084a1.5 1.5 0 011.5-1.5h5.996a1.5 1.5 0 011.5 1.5V1.5a3.375 3.375 0 01-3.375 3.375h-.671c2.881 3.684 7.381 6.067 12.436 6.067a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436h.671A3.375 3.375 0 0120.462 18v.416a1.5 1.5 0 01-1.5 1.5h-5.996a1.5 1.5 0 01-1.5-1.5V18a3.375 3.375 0 013.375-3.375h.671z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPreviewImage(null)}
                      className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-700 font-semibold hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                    >
                      Tekrar Dene
                    </button>
                    <button
                      onClick={handleConfirmAvatar}
                      disabled={confirming}
                      className="flex-1 py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                    >
                      {confirming ? 'Kaydediliyor...' : 'Bu Resmi Kullan'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- SAYFA İÇERİĞİ --- */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl tracking-tight">
          {t('profileTitle') || 'Profilim'}
        </h1>
        <button
          onClick={() => router.back()}
          className="text-sm font-medium opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 016 6v3"
            />
          </svg>
          {t('goBack') || 'Geri Dön'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        {/* SOL KOLON */}
        <div className="md:col-span-1 flex flex-col gap-6">
          <ProfileHeroCard
            user={session.user}
            avatarSrc={avatarSrc}
            stats={stats}
            onSignOut={() => void signOut({ callbackUrl: '/' })}
            onEditAvatar={() => setShowImageModal(true)}
            onOpenDocuments={() => router.push('/documents')}
            t={t}
          />

          <LlmPreferenceCard
            llmData={llmData}
            mutateLlm={mutateLlm}
            session={session ?? null}
            t={t}
          />
        </div>

        {/* SAĞ KOLON */}
        <div className="md:col-span-2 space-y-6">
          <ProfileStatsCards stats={stats} userPlan={userPlan} t={t} />

          <AccountSettingsSection onRequestDelete={handleRequestDelete} t={t} />
        </div>
      </div>
    </main>
  );
}
