// src/services/pdfService.ts

import { guestService } from './guestService';
import { resolveApiBaseUrl } from '@/utils/api';

interface UploadResponse {
  filename: string;
  size_kb: number;
  temp_id: string;
}

interface SaveProcessedResponse {
  filename?: string;
  size_kb?: number;
  [key: string]: unknown;
}

class PDFService {
  /**
   * ✅ GÜNCELLEME: NextAuth token'ı kullan
   * Authorization header'ı hazırla
   * @param session - NextAuth session objesi (useSession'dan gelen)
   */
  private getAuthHeaders(apiToken?: string | null): HeadersInit {
    const headers: HeadersInit = {};

    if (apiToken) {
      headers['Authorization'] = `Bearer ${apiToken}`;
    }

    return headers;
  }

  /**
   * Guest ID header'ı ekle (giriş yapılmamışsa)
   */
  private async getGuestHeaders(isLoggedIn: boolean): Promise<HeadersInit> {
    const headers: HeadersInit = {};

    if (!isLoggedIn) {
      const guestId = await guestService.getGuestId();
      headers['X-Guest-ID'] = guestId;
    }

    return headers;
  }

  /**
   * Dosyayı indirmek için yardımcı fonksiyon
   */
  private downloadFile(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;

    document.body.appendChild(a);
    a.click();

    // Cleanup
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 100);
  }

  /**
   * PDF Upload (geçici olarak)
   */
  async upload(file: File, apiToken?: string | null): Promise<UploadResponse> {
    const apiBaseUrl = resolveApiBaseUrl();
    const formData = new FormData();
    formData.append('file', file);

    const authHeaders = this.getAuthHeaders(apiToken);
    const guestHeaders = await this.getGuestHeaders(!!apiToken);

    const response = await fetch(`${apiBaseUrl}/files/upload`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        ...guestHeaders,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || `Upload failed: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * PDF to Text Conversion
   * Download sonrası guest usage artır
   */
  async convertToText(file: File, apiToken?: string | null): Promise<void> {
    const apiBaseUrl = resolveApiBaseUrl();
    const isLoggedIn = !!apiToken;
    const formData = new FormData();
    formData.append('file', file);

    const authHeaders = this.getAuthHeaders(apiToken);
    const guestHeaders = await this.getGuestHeaders(isLoggedIn);

    const response = await fetch(`${apiBaseUrl}/files/convert-text`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        ...guestHeaders,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || `Conversion failed: ${response.status}`);
    }

    const blob = await response.blob();
    const filename = file.name.replace(/\.pdf$/i, '.txt');

    // Dosyayı indir
    this.downloadFile(blob, filename);

    // Guest kullanıcı ise usage artır
    if (!isLoggedIn) {
      try {
        await guestService.incrementUsage();
      } catch (error) {
        console.error('❌ Could not increment guest usage:', error);
      }
    }
  }

  /**
   * Extract Pages
   * Download sonrası guest usage artır
   */
  async extractPages(
    file: File,
    pageRange: string,
    apiToken?: string | null
  ): Promise<void> {
    const apiBaseUrl = resolveApiBaseUrl();
    const isLoggedIn = !!apiToken;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('page_range', pageRange);

    const authHeaders = this.getAuthHeaders(apiToken);
    const guestHeaders = await this.getGuestHeaders(isLoggedIn);

    const response = await fetch(`${apiBaseUrl}/files/extract-pages`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        ...guestHeaders,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || `Extraction failed: ${response.status}`);
    }

    const blob = await response.blob();
    const safePageRange = pageRange.replace(/[^a-zA-Z0-9-]/g, '_');
    const filename = file.name.replace('.pdf', `_pages_${safePageRange}.pdf`);

    // Dosyayı indir
    this.downloadFile(blob, filename);

    // Guest kullanıcı ise usage artır
    if (!isLoggedIn) {
      try {
        await guestService.incrementUsage();
      } catch (error) {
        console.error('❌ Could not increment guest usage:', error);
      }
    }
  }

  /**
   * Merge PDFs
   * Download sonrası guest usage artır
   */
  async mergePDFs(files: File[], apiToken?: string | null): Promise<void> {
    const apiBaseUrl = resolveApiBaseUrl();
    const isLoggedIn = !!apiToken;
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    const authHeaders = this.getAuthHeaders(apiToken);
    const guestHeaders = await this.getGuestHeaders(isLoggedIn);

    const response = await fetch(`${apiBaseUrl}/files/merge-pdfs`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        ...guestHeaders,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || `Merge failed: ${response.status}`);
    }

    const blob = await response.blob();
    const filename = 'merged.pdf';

    // Dosyayı indir
    this.downloadFile(blob, filename);

    // Guest kullanıcı ise usage artır
    if (!isLoggedIn) {
      try {
        await guestService.incrementUsage();
      } catch (error) {
        console.error('❌ Could not increment guest usage:', error);
      }
    }
  }

  /**
   * ✅ GÜNCELLEME: Save Processed PDF
   * İşlenmiş PDF'i kullanıcının hesabına kaydet (sadece login user)
   * @param blob - PDF blob
   * @param filename - Dosya adı
   * @param apiToken - NextAuth session'dan gelen token
   */
  async saveProcessed(
    blob: Blob,
    filename: string,
    apiToken?: string | null
  ): Promise<SaveProcessedResponse> {
    const apiBaseUrl = resolveApiBaseUrl();
    if (!apiToken) {
      throw new Error('You must be logged in to save files');
    }

    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('filename', filename);

    const authHeaders = this.getAuthHeaders(apiToken);

    const response = await fetch(`${apiBaseUrl}/files/save-processed`, {
      method: 'POST',
      headers: authHeaders,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || `Save failed: ${response.status}`);
    }

    const result = await response.json();
    return result;
  }

  /**
   * Markdown içeriğini sunucuda PDF'e çevirip indirir (/files/markdown-to-pdf).
   */
  async createPdfFromMarkdown(
    markdown: string,
    filename: string = 'summary.pdf',
    apiToken?: string | null
  ): Promise<void> {
    const apiBaseUrl = resolveApiBaseUrl();
    const isLoggedIn = !!apiToken;
    const authHeaders = this.getAuthHeaders(apiToken);
    const guestHeaders = await this.getGuestHeaders(isLoggedIn);

    const response = await fetch(`${apiBaseUrl}/files/markdown-to-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...guestHeaders,
      },
      body: JSON.stringify({ markdown }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(
        error?.detail || `Markdown PDF failed: ${response.status}`
      );
    }

    const blob = await response.blob();
    const safeName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    this.downloadFile(blob, safeName);
  }
}

// Singleton instance
export const pdfService = new PDFService();
