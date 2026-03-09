// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { PopupProvider } from "@/context/PopupContext";
import Providers from "./Providers";
import NavBar from "@/components/NavBar";
import ClientPdfPanel from "@/components/ClientPdfPanel";
import EulaGuard from "@/components/auth/EulaGuard";
import GlobalPdfChat from "@/components/GlobalPdfChat"; // 1. Global chat bileşenini import et
import ProGlobalChat from "@/components/ProGlobalChat"; // Pro kullanıcılar için genel AI chat

import { PdfProvider } from "@/context/PdfContext";
import { LanguageProvider } from "@/context/LanguageContext";

export const metadata: Metadata = {
  title: "PDF-AI",
  description: "Google ile giriş + FastAPI JWT akışı",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="antialiased transition-colors duration-300 bg-[var(--background)] text-[var(--foreground)]">
        <Providers>
          <LanguageProvider>
            <PdfProvider>
              <PopupProvider>
              <NavBar />

              <EulaGuard>
                <div
                  className="flex min-h-screen"
                  style={{ paddingTop: "var(--navbar-height)" }}
                >
                  <main className="flex-1 flex flex-col min-w-0 px-4 md:px-6">
                    {children}
                  </main>

                  <div className="hidden lg:block">
                    <ClientPdfPanel />
                  </div>
                </div>
              {/* ✅ 2. Global Chat Katmanı: PdfProvider içinde olduğu için 
                  context'teki dosyaya her zaman erişebilecek. */}
              <GlobalPdfChat />
              {/* ✅ 3. Pro Global Chat: Pro kullanıcılar için genel AI asistanı */}
              <ProGlobalChat />
              </EulaGuard>
              </PopupProvider>
            </PdfProvider>
          </LanguageProvider>
        </Providers>
      </body>
    </html>
  );
}