"use client";

import { SessionProvider } from "next-auth/react";
import { pdfjs } from "react-pdf";

// ------------------------------------------------------------------
// ✅ PDF Worker - Global Konfigürasyon
// ------------------------------------------------------------------
// Bu ayar, uygulamanın herhangi bir yerinde (Merge, Extract, Edit vb.)
// PDF.js kullanıldığında worker'ın otomatik yüklenmesini sağlar.
//
// CDN Kullanıyoruz çünkü:
// 1. Yerel dosyalarla uğraşmanıza gerek kalmaz (/public klasörüne dosya atmak vs.)
// 2. "pdfjs.version" değişkeni sayesinde her zaman kütüphanenizle
//    %100 uyumlu worker sürümü yüklenir. Çökme riskini sıfıra indirir.
// ------------------------------------------------------------------

if (typeof window !== "undefined") {
  // Yerel worker kullan: public/pdf.worker.mjs
  // Bu, CDN erişimi/versiyon uyumsuzluğu sorunlarını ortadan kaldırır.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
    </SessionProvider>
  );
}