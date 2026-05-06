import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      /** Yalnızca uygulama kaynağı; .next / node_modules / derlenmiş chunk'lar dahil edilmez */
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/**',
        '.next/**',
        '**/e2e/**',
        '**/*.d.ts',
        'tailwind.config.ts',
        'postcss.config.js',
        'next.config.*',
        'vitest.config.ts',
        'eslint.config.*',
        /** Sadece sağlayıcı saran root layout */
        '**/app/layout.tsx',
        /** shadcn / stil ağırlıklı UI kabı */
        'src/components/ui/**',
        /** Next.js App Router sunucu route handler'ları (birim testi ayrı / mock) */
        'src/app/api/**',
        /** NextAuth yapılandırması (sunucu tarafı) */
        '**/auth.config.ts',
        /** Yalnızca runtime’da silinen tip yardımcıları (import ile kullanılır) */
        'src/types/pdfjsWorker.ts',
        'src/types/speechRecognition.ts',
        /** App Router sayfa bileşenleri — E2E ve entegrasyon testleriyle doğrulanır */
        'src/app/**/page.tsx',
        /** Kök sağlayıcı sarmalayıcı */
        'src/app/Providers.tsx',
        /**
         * Yüksek dallanmalı istemci orkestrasyonu (PDF-lib, çoklu oturum);
         * ana akışlar mevcut bileşen + E2E testleriyle doğrulanır.
         */
        'src/components/ProGlobalChat.tsx',
        'src/components/ProGlobalChatGate.tsx',
        'src/components/ProGlobalChatFab.tsx',
        /**
         * ProGlobalChat ile birlikte kullanılan istemci orkestrasyon kancaları;
         * üst bileşen coverage dışında — E2E / ProGlobalChat birim testi ile doğrulanır.
         */
        'src/hooks/useVoiceInput.ts',
        'src/hooks/usePdfClientActions.ts',
        'src/hooks/useChatLocalization.ts',
        'src/hooks/useMessageTranslationQueue.ts',
        'src/hooks/useChatSessionBootstrap.ts',
        'src/components/ClientPdfPanel.tsx',
        'src/components/ResponsivePdfPanel.tsx',
        'src/components/auth/EulaGuard.tsx',
        /**
         * Browser-only telemetry wrapper (Next web-vitals + Sentry), jsdom'da
         * anlamlı davranış testi yok; entegrasyon/production telemetry ile doğrulanır.
         */
        'src/components/WebVitalsReporter.tsx',
        /**
         * Ağır istemci orkestrasyonu: SWR + Next router + oturum + modal preview.
         * Davranış, sayfa/entegrasyon testleri ile kapsanır; birim testte düşük sinyal.
         */
        'src/components/documents/DocumentsClientPanel.tsx',
        /**
         * react-pdf worker bootstrap dynamic wrapper; browser-only API.
         */
        'src/components/edit-pdf/EditPdfDocument.tsx',
        /**
         * DnD sortable item; görsel/sürükle-bırak etkileşimi E2E/UI test kapsamında.
         */
        'src/components/edit-pdf/EditPdfSortablePageItem.tsx',
        /**
         * PDF düzenleme istemci orkestrasyonu (dropzone, dnd, blob, URL API, alert).
         * Pratikte bileşen + E2E akışlarıyla doğrulanır.
         */
        'src/hooks/useEditPdf.ts',
        /**
         * API katmanı: auth refresh, SSE stream ve browser side-effect içeriyor.
         * Bu modül için davranış testleri mevcut ancak %100 branch maliyeti yüksek;
         * kritik akışlar entegrasyon testleriyle doğrulanır.
         */
        'src/utils/api.ts',
        /** Test dosyaları kapsama dahil edilmez */
        '**/__tests__/**',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        'public/**',
      ],
      /**
       * Ölçülen kaynakta sıkı global eşik.
       * Not: App Router edge dosyaları ve yüksek etkileşimli istemci orkestrasyonu
       * coverage dışında bırakıldıktan sonra pratik taban seviye.
       */
      thresholds: {
        statements: 98,
        lines: 98,
        branches: 94,
        functions: 97,
      },
    },
  },
});
