"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";

// PDF Worker yapılandırması - Global seviyede yap (tüm sayfalar için)
if (typeof window !== "undefined") {
  import("react-pdf").then((mod) => {
    const pdfjs = mod.pdfjs;
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/875b7ef5-8e65-4044-b050-49490fad64c5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Providers.tsx:8',message:'Global worker config start',data:{hasWorkerSrc:!!(pdfjs as any).GlobalWorkerOptions.workerSrc,currentWorkerSrc:(pdfjs as any).GlobalWorkerOptions.workerSrc,version:(pdfjs as any).version},timestamp:Date.now(),runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    // Worker yapılandırmasını her zaman doğru CDN URL'i ile set et (yanlış değer varsa override et)
    const correctWorkerSrc = "/pdf.worker.mjs";
    if (!(pdfjs as any).GlobalWorkerOptions.workerSrc || (pdfjs as any).GlobalWorkerOptions.workerSrc === "pdf.worker.mjs" || !(pdfjs as any).GlobalWorkerOptions.workerSrc.startsWith("http")) {
      (pdfjs as any).GlobalWorkerOptions.workerSrc = correctWorkerSrc;
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/875b7ef5-8e65-4044-b050-49490fad64c5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Providers.tsx:12',message:'Global worker config set',data:{workerSrc:(pdfjs as any).GlobalWorkerOptions.workerSrc,wasFixed:true},timestamp:Date.now(),runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    }
  }).catch((err) => {
    console.error("PDF worker yapılandırılamadı:", err);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/875b7ef5-8e65-4044-b050-49490fad64c5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Providers.tsx:15',message:'Global worker config error',data:{error:String(err)},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
  });
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster position="top-center" richColors closeButton />
    </SessionProvider>
  );
}