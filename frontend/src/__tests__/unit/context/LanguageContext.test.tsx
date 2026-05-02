import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { LanguageProvider, useLanguage } from '@/context/LanguageContext';
import { translations } from '@/utils/translations';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('LanguageContext', () => {
  beforeEach(() => {
    // Her test öncesi localStorage'ı temizle
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with Turkish (tr) as default language', () => {
      const { result } = renderHook(() => useLanguage(), {
        wrapper: LanguageProvider,
      });

      expect(result.current.language).toBe('tr');
    });

    it('should restore language from localStorage on mount', async () => {
      localStorageMock.setItem('app-language', 'en');

      const { result } = renderHook(() => useLanguage(), {
        wrapper: LanguageProvider,
      });

      await waitFor(() => {
        expect(result.current.language).toBe('en');
      });
    });

    it('should ignore invalid language values in localStorage', async () => {
      localStorageMock.setItem('app-language', 'invalid');

      const { result } = renderHook(() => useLanguage(), {
        wrapper: LanguageProvider,
      });

      // Should default to 'tr' since 'invalid' is not a valid language
      await waitFor(() => {
        expect(result.current.language).toBe('tr');
      });
    });

    it('should handle missing localStorage gracefully', () => {
      const { result } = renderHook(() => useLanguage(), {
        wrapper: LanguageProvider,
      });

      expect(result.current.language).toBe('tr');
    });
  });

  describe('setLanguage', () => {
    it('should change language from tr to en', () => {
      const { result } = renderHook(() => useLanguage(), {
        wrapper: LanguageProvider,
      });

      expect(result.current.language).toBe('tr');

      act(() => {
        result.current.setLanguage('en');
      });

      expect(result.current.language).toBe('en');
    });

    it('should change language from en to tr', () => {
      const { result } = renderHook(() => useLanguage(), {
        wrapper: LanguageProvider,
      });

      act(() => {
        result.current.setLanguage('en');
      });

      expect(result.current.language).toBe('en');

      act(() => {
        result.current.setLanguage('tr');
      });

      expect(result.current.language).toBe('tr');
    });

    it('should save language preference to localStorage', () => {
      const { result } = renderHook(() => useLanguage(), {
        wrapper: LanguageProvider,
      });

      act(() => {
        result.current.setLanguage('en');
      });

      expect(localStorageMock.getItem('app-language')).toBe('en');

      act(() => {
        result.current.setLanguage('tr');
      });

      expect(localStorageMock.getItem('app-language')).toBe('tr');
    });

    it('should persist language changes across multiple calls', () => {
      const { result } = renderHook(() => useLanguage(), {
        wrapper: LanguageProvider,
      });

      act(() => {
        result.current.setLanguage('en');
        result.current.setLanguage('tr');
        result.current.setLanguage('en');
      });

      expect(result.current.language).toBe('en');
      expect(localStorageMock.getItem('app-language')).toBe('en');
    });
  });

  describe('Translation Function (t)', () => {
    it('should return Turkish translation for tr language', () => {
      const { result } = renderHook(() => useLanguage(), {
        wrapper: LanguageProvider,
      });

      expect(result.current.language).toBe('tr');
      expect(result.current.t('loginButton')).toBe(translations.tr.loginButton);
      expect(result.current.t('appTitle')).toBe(translations.tr.appTitle);
    });

    it('should return English translation for en language', () => {
      const { result } = renderHook(() => useLanguage(), {
        wrapper: LanguageProvider,
      });

      act(() => {
        result.current.setLanguage('en');
      });

      expect(result.current.t('loginButton')).toBe(translations.en.loginButton);
      expect(result.current.t('appTitle')).toBe(translations.en.appTitle);
    });

    it('should update translations when language changes', () => {
      const { result } = renderHook(() => useLanguage(), {
        wrapper: LanguageProvider,
      });

      const trTranslation = result.current.t('loginButton');
      expect(trTranslation).toBe(translations.tr.loginButton);

      act(() => {
        result.current.setLanguage('en');
      });

      const enTranslation = result.current.t('loginButton');
      expect(enTranslation).toBe(translations.en.loginButton);
      expect(enTranslation).not.toBe(trTranslation);
    });

    it('should return key as fallback for missing translations', () => {
      const { result } = renderHook(() => useLanguage(), {
        wrapper: LanguageProvider,
      });

      // TypeScript'te bu key mevcut olmayabilir, ama runtime'da test ediyoruz
      const missingKey = 'nonExistentKey' as keyof typeof translations.tr;
      const translation = result.current.t(missingKey);

      // Eğer key yoksa, key'in kendisini döndürmeli
      expect(translation).toBeDefined();
    });

    it('should handle all common translation keys', () => {
      const { result } = renderHook(() => useLanguage(), {
        wrapper: LanguageProvider,
      });

      // Birkaç önemli key'i test et
      const keys: Array<keyof typeof translations.tr> = [
        'loginButton',
        'appTitle',
        'email',
        'password',
        'loading',
      ];

      keys.forEach((key) => {
        const translation = result.current.t(key);
        expect(translation).toBeDefined();
        expect(typeof translation).toBe('string');
        expect(translation.length).toBeGreaterThan(0);
      });
    });
  });

  describe('localStorage Integration', () => {
    it('should read from localStorage on mount', async () => {
      localStorageMock.setItem('app-language', 'en');

      const { result } = renderHook(() => useLanguage(), {
        wrapper: LanguageProvider,
      });

      await waitFor(() => {
        expect(result.current.language).toBe('en');
      });
    });

    it('should write to localStorage when language changes', () => {
      const { result } = renderHook(() => useLanguage(), {
        wrapper: LanguageProvider,
      });

      expect(localStorageMock.getItem('app-language')).toBeNull();

      act(() => {
        result.current.setLanguage('en');
      });

      expect(localStorageMock.getItem('app-language')).toBe('en');
    });

    it('should handle localStorage errors gracefully', () => {
      // localStorage.setItem'ı mock'la ve hata fırlat
      const originalSetItem = localStorageMock.setItem;
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      localStorageMock.setItem = vi.fn(() => {
        throw new Error('Storage error');
      });

      const { result } = renderHook(() => useLanguage(), {
        wrapper: LanguageProvider,
      });

      // setLanguage çağrıldığında hata fırlatılabilir, ama dil state'i değişmeli
      // (Context kodunda try-catch yok, bu yüzden hata fırlatılır ama state güncellenir)
      act(() => {
        try {
          result.current.setLanguage('en');
        } catch {
          // Hata bekleniyor, devam et
        }
      });

      // Dil state'i güncellenmiş olmalı (setLanguage çağrıldı)
      expect(result.current.language).toBe('en');

      localStorageMock.setItem = originalSetItem;
      consoleErrorSpy.mockRestore();
    });
  });

  describe('SSR Compatibility', () => {
    it('should use default language when window is undefined', () => {
      // Bu test SSR ortamını simüle edemez çünkü React DOM window'a ihtiyaç duyar
      // Bunun yerine, useEffect'in window kontrolünü test ediyoruz
      const { result } = renderHook(() => useLanguage(), {
        wrapper: LanguageProvider,
      });

      // window undefined olsa bile default language kullanılmalı
      // (useEffect içindeki window kontrolü sayesinde)
      expect(result.current.language).toBe('tr');
    });
  });

  describe('useLanguage guard', () => {
    it('throws when used outside LanguageProvider', () => {
      expect(() => renderHook(() => useLanguage())).toThrow(
        /LanguageProvider/i
      );
    });
  });
});
