import { resolveApiBaseUrl } from '@/utils/api';
import { logError } from '@/utils/logger';

interface GuestSession {
  guest_id: string;
  usage_count: number;
  remaining_usage: number;
  max_usage: number;
}

interface UsageCheck {
  can_use: boolean;
  usage_count: number;
  remaining_usage: number;
  message: string;
}

class GuestService {
  private guestId: string | null = null;

  /**
   * LocalStorage'dan guest_id'yi al
   * Uygulama başlangıcında bir kez çağrılır
   */
  initializeGuestId(): void {
    if (typeof window === 'undefined') return;

    this.guestId = localStorage.getItem('guest_id');
  }

  /**
   * ✅ DÜZELTME: Sunucuda guest session oluştur
   */
  async createSession(): Promise<GuestSession> {
    try {
      const response = await fetch(`${resolveApiBaseUrl()}/guest/session`, {
        method: 'POST', // ✅ POST olmalı!
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to create guest session status=${response.status} ${errorText.slice(0, 300)}`,
        );
      }

      const data: GuestSession = await response.json();
      this.guestId = data.guest_id;

      if (typeof window !== 'undefined') {
        localStorage.setItem('guest_id', this.guestId);
      }

      return data;
    } catch (error) {
      logError(error, { scope: 'guestService.createSession' });
      throw error;
    }
  }

  /**
   * Guest ID'yi al, yoksa oluştur
   */
  async getGuestId(): Promise<string> {
    this.initializeGuestId();
    if (!this.guestId) {
      await this.createSession();
    }
    return this.guestId!;
  }

  /**
   * ✅ DÜZELTME: Kullanım durumunu kontrol et
   */
  async checkUsage(): Promise<UsageCheck> {
    try {
      const guestId = await this.getGuestId();

      const response = await fetch(`${resolveApiBaseUrl()}/guest/check-usage`, {
        method: 'GET', // ✅ GET doğru
        headers: {
          'X-Guest-ID': guestId,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to check usage status=${response.status} ${errorText.slice(0, 300)}`,
        );
      }

      const result = await response.json();
      return result;
    } catch (error) {
      logError(error, { scope: 'guestService.checkUsage' });
      throw error;
    }
  }

  /**
   * ✅ DÜZELTME: Kullanım sayısını artır
   */
  async incrementUsage(): Promise<UsageCheck> {
    try {
      const guestId = await this.getGuestId();

      const response = await fetch(`${resolveApiBaseUrl()}/guest/use`, {
        method: 'POST', // ✅ POST doğru
        headers: {
          'X-Guest-ID': guestId,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Usage limit reached');
      }

      const result = await response.json();
      return result;
    } catch (error) {
      logError(error, { scope: 'guestService.incrementUsage' });
      throw error;
    }
  }

  /**
   * Guest session'ı temizle
   */
  async clearSession(): Promise<void> {
    try {
      if (!this.guestId) return;

      await fetch(`${resolveApiBaseUrl()}/guest/session`, {
        method: 'DELETE',
        headers: {
          'X-Guest-ID': this.guestId,
        },
      });

      if (typeof window !== 'undefined') {
        localStorage.removeItem('guest_id');
      }

      this.guestId = null;
    } catch (error) {
      logError(error, { scope: 'guestService.clearSession' });
    }
  }

  /**
   * ✅ GÜNCELLEME: NextAuth session kontrolü
   */
  isLoggedIn(): boolean {
    if (typeof window === 'undefined') return false;

    // NextAuth session bilgisini kontrol et
    // Bu bilgi client component'lerde useSession() ile alınmalı
    console.warn(
      '⚠️ guestService.isLoggedIn() deprecated. Use useSession() from next-auth/react instead.',
    );

    return false;
  }

  /**
   * Mevcut guest ID'yi al (varsa)
   */
  getCurrentGuestId(): string | null {
    return this.guestId;
  }
}

// Singleton instance
export const guestService = new GuestService();
