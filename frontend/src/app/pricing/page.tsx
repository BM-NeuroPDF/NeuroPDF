"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { sendRequest } from "@/utils/api";

export default function PricingPage() {
  const { data: session, status } = useSession();
  const { t } = useLanguage();
  const router = useRouter();

  // Rol durumunu state'te tutuyoruz
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ Backend'den Güncel Rolü Çekme
  useEffect(() => {
    const fetchUserRole = async () => {
      if (status === "authenticated") {
        try {
          const data = await sendRequest("/files/user/stats");
          setUserRole(data.role); 
        } catch (error) {
          console.error("Rol bilgisi alınamadı:", error);
          setUserRole("Standart");
        } finally {
          setLoading(false);
        }
      } else if (status === "unauthenticated") {
        setUserRole("Guest");
        setLoading(false);
      }
    };

    fetchUserRole();
  }, [status]);

  // --- ÖZELLİK LİSTESİ ---
  const features = [
    { key: "monthlyUpload", guest: "3 PDF", standard: "10 PDF", pro: "Sınırsız" },
    { key: "maxFileSize", guest: "5 MB", standard: "25 MB", pro: "100 MB" },
    { key: "aiQuestions", guest: "Yok", standard: "Günlük 20", pro: "Sınırsız" },
    { key: "ocrSupport", guest: false, standard: false, pro: true },
    { key: "adFree", guest: false, standard: false, pro: true },
    { key: "prioritySupport", guest: false, standard: false, pro: true },
  ];

  // Yükleniyor durumu (Skeleton)
  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen pt-24 flex justify-center px-6">
        <div className="animate-pulse w-full max-w-7xl grid grid-cols-1 md:grid-cols-3 gap-8">
           <div className="h-96 bg-[var(--container-bg)] rounded-3xl border border-[var(--navbar-border)]"></div>
           <div className="h-96 bg-[var(--container-bg)] rounded-3xl border border-[var(--navbar-border)]"></div>
           <div className="h-96 bg-[var(--container-bg)] rounded-3xl border border-[var(--navbar-border)]"></div>
        </div>
      </div>
    );
  }

  return (
    // Navbar layout'tan geldiği için sadece üst boşluk (pt-24) veriyoruz.
    <div className="min-h-screen pt-24 pb-12 transition-colors duration-300">
      
      {/* --- BAŞLIK --- */}
      <div className="text-center mb-12 px-4">
        <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight text-[var(--foreground)]">
          {t('pricingTitle') || "Size Uygun Planı Seçin"}
        </h2>
        <p className="text-lg opacity-60 max-w-2xl mx-auto text-[var(--foreground)]">
          {t('pricingSubtitle') || "İster misafir olun, ister profesyonel; NeuroPDF ile sınırları kaldırın."}
        </p>
      </div>

      {/* --- KARTLAR --- */}
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          
          {/* 1. MİSAFİR KARTI */}
          <div className={`relative p-8 rounded-3xl border transition-all hover:shadow-xl bg-[var(--container-bg)] border-[var(--navbar-border)] ${userRole === 'Guest' ? 'ring-2 ring-gray-500 shadow-xl scale-[1.02]' : 'opacity-80 hover:opacity-100'}`}>
            {userRole === 'Guest' && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gray-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
                    {t('currentPlan') || "Mevcut Plan"}
                </div>
            )}
            <h3 className="text-xl font-bold mb-2 text-gray-500">{t('planGuest') || "Misafir"}</h3>
            <div className="text-4xl font-extrabold mb-6 text-[var(--foreground)]">₺0<span className="text-lg font-normal opacity-50">/mo</span></div>
            <p className="text-sm opacity-60 mb-8 h-10 text-[var(--foreground)]">{t('guestDesc') || "Hesap açmadan hızlı işlemler."}</p>
            
            <button disabled className="w-full py-3 rounded-xl font-semibold border border-gray-300 dark:border-gray-700 text-gray-500 cursor-default">
              {t('startFree') || "Hemen Başla"}
            </button>

            <ul className="mt-8 space-y-4">
              {features.map((f, i) => (
                <FeatureItem key={i} label={t(f.key as any) || f.key} value={f.guest} />
              ))}
            </ul>
          </div>

          {/* 2. STANDART KARTI */}
          <div className={`relative p-8 rounded-3xl border transition-all hover:shadow-2xl bg-[var(--container-bg)] border-blue-500/30 ${userRole === 'Standart' || userRole === 'Standard' ? 'ring-2 ring-blue-500 shadow-blue-500/20 shadow-2xl scale-[1.02] z-10' : ''}`}>
             {(userRole === 'Standart' || userRole === 'Standard') && (
                 <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
                     {t('currentPlan') || "Mevcut Plan"}
                 </div>
             )}
            <h3 className="text-xl font-bold mb-2 text-blue-500">{t('planStandard') || "Standart"}</h3>
            <div className="text-4xl font-extrabold mb-6 text-[var(--foreground)]">{t('free') || "Ücretsiz"}</div>
            <p className="text-sm opacity-60 mb-8 h-10 text-[var(--foreground)]">{t('standardDesc') || "Üye olanlar için genişletilmiş limitler."}</p>
            
            {userRole === 'Guest' ? (
                 <button onClick={() => router.push('/login')} className="w-full py-3 rounded-xl font-semibold bg-[var(--button-bg)] text-white hover:brightness-110 transition-all shadow-lg">
                    {t('createAccount') || "Hesap Oluştur"}
                 </button>
            ) : (userRole === 'Standart' || userRole === 'Standard') ? (
                <button disabled className="w-full py-3 rounded-xl font-semibold bg-blue-500/20 text-blue-500 cursor-default border border-blue-500/50">
                    {t('active') || "Aktif"}
                 </button>
            ) : (
                <button disabled className="w-full py-3 rounded-xl font-semibold border border-gray-600 text-gray-500 cursor-default">
                    {t('included') || "Dahil"}
                </button>
            )}

            <ul className="mt-8 space-y-4">
              {features.map((f, i) => (
                <FeatureItem key={i} label={t(f.key as any) || f.key} value={f.standard} highlight />
              ))}
            </ul>
          </div>

          {/* 3. PRO KARTI */}
          <div className={`relative p-8 rounded-3xl border transition-all hover:shadow-2xl transform bg-gradient-to-b from-[var(--container-bg)] to-[var(--background)] border-purple-500/50 ${(userRole === 'Pro' || userRole === 'Admin') ? 'ring-2 ring-purple-500 shadow-purple-500/30 shadow-2xl scale-[1.02] z-10' : ''}`}>
            
            <div className="absolute top-0 right-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold px-3 py-1 rounded-bl-xl rounded-tr-2xl shadow-lg">
              {t('recommended') || "ÖNERİLEN"}
            </div>

            {(userRole === 'Pro' || userRole === 'Admin') && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
                    {t('currentPlan') || "Mevcut Plan"}
                </div>
            )}
            
            <h3 className="text-xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">{t('planPro') || "Neuro Pro"}</h3>
            <div className="text-4xl font-extrabold mb-6 text-[var(--foreground)]">₺99<span className="text-lg font-normal opacity-50">/mo</span></div>
            <p className="text-sm opacity-60 mb-8 h-10 text-[var(--foreground)]">{t('proDesc') || "Profesyoneller için sınırsız AI gücü."}</p>
            
            {(userRole === 'Pro' || userRole === 'Admin') ? (
                 <button disabled className="w-full py-3 rounded-xl font-semibold bg-purple-500/20 text-purple-400 cursor-default border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                    {t('active') || "Aktif"}
                 </button>
            ) : (
                <button className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:brightness-110 transition-all shadow-lg shadow-purple-600/30 active:scale-[0.98]">
                  {t('upgradePro') || "Pro'ya Yükselt"}
                </button>
            )}
            
            <ul className="mt-8 space-y-4">
              {features.map((f, i) => (
                <FeatureItem key={i} label={t(f.key as any) || f.key} value={f.pro} isPro />
              ))}
            </ul>
          </div>

        </div>
      </div>
    </div>
  );
}

// --- YARDIMCI BİLEŞEN ---
function FeatureItem({ label, value, highlight = false, isPro = false }: { label: string, value: string | boolean, highlight?: boolean, isPro?: boolean }) {
  return (
    <li className="flex items-center justify-between text-sm group">
      <span className={`font-medium text-[var(--foreground)] ${isPro ? 'opacity-100' : 'opacity-70'}`}>{label}</span>
      <span className="font-bold flex items-center gap-1">
        {value === true ? (
          <div className={`p-1 rounded-full ${isPro ? 'bg-purple-500/20 text-purple-400' : 'bg-green-500/20 text-green-500'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
          </div>
        ) : value === false ? (
          <div className="p-1 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-400">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </div>
        ) : (
          <span className={`${isPro ? 'text-purple-400' : highlight ? 'text-blue-500' : 'opacity-70 text-[var(--foreground)]'}`}>
            {value}
          </span>
        )}
      </span>
    </li>
  )
}