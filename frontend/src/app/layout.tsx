// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { PopupProvider } from '@/context/PopupContext';
import Providers from './Providers';
import NavBar from '@/components/NavBar';
import ResponsivePdfPanel from '@/components/ResponsivePdfPanel';
import EulaGuard from '@/components/auth/EulaGuard';
import { ProGlobalChatGate } from '@/components/ProGlobalChatGate';
import WebVitalsReporter from '@/components/WebVitalsReporter';

import { PdfProvider } from '@/context/PdfContext';
import { LanguageProvider } from '@/context/LanguageContext';

export const metadata: Metadata = {
  title: 'NeuroPDF',
  description: 'Google ile giriş + FastAPI JWT akışı',
  icons: {
    icon: '/logo/NeuroPDF-Chat.svg',
    shortcut: '/logo/NeuroPDF-Chat.svg',
    apple: '/logo/NeuroPDF-Chat.svg',
  },
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
                <WebVitalsReporter />

                <EulaGuard>
                  <div className="flex min-h-screen" style={{ paddingTop: 'var(--navbar-height)' }}>
                    <main className="relative z-0 flex min-h-0 flex-1 flex-col min-w-0 px-4 md:px-6">
                      {children}
                    </main>

                    <div className="relative z-[31] w-0 shrink-0 overflow-visible">
                      <ResponsivePdfPanel />
                    </div>
                  </div>
                  {/* Global ProChat: ağır ağaç defer; girişli kullanıcıda idle / ilk etkileşimde yüklenir */}
                  <ProGlobalChatGate />
                </EulaGuard>
              </PopupProvider>
            </PdfProvider>
          </LanguageProvider>
        </Providers>
      </body>
    </html>
  );
}
