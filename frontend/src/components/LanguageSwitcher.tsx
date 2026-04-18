'use client';

import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (lang: 'tr' | 'en') => {
    setLanguage(lang);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* --- ANA BUTON --- */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn-primary flex items-center gap-2 min-w-[80px] justify-between"
      >
        <span className="text-sm font-bold flex items-center gap-2">
          <img
            src={language === 'tr' ? '/flags/tr.svg' : '/flags/gb.svg'}
            alt="flag"
            className="w-5 h-4"
          />
          {language === 'tr' ? 'TR' : 'ENG'}
        </span>

        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* --- DROPDOWN --- */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-32 rounded-xl shadow-xl border overflow-hidden z-[5000] animate-in fade-in zoom-in-95 duration-100"
          style={{
            backgroundColor: 'var(--background)',
            borderColor: 'var(--navbar-border)',
          }}
        >
          <div className="p-1 flex flex-col gap-0.5">
            {/* TR */}
            <button
              onClick={() => handleSelect('tr')}
              className={`flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg transition-colors ${
                language === 'tr'
                  ? 'btn-primary shadow-none'
                  : 'text-[var(--foreground)] hover:bg-[var(--container-bg)]'
              }`}
            >
              <span className="flex items-center gap-2">
                <img src="/flags/tr.svg" alt="" className="w-5 h-4" />
                TR
              </span>
              {language === 'tr' && <span>✓</span>}
            </button>

            {/* ENG */}
            <button
              onClick={() => handleSelect('en')}
              className={`flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg transition-colors ${
                language === 'en'
                  ? 'btn-primary shadow-none'
                  : 'text-[var(--foreground)] hover:bg-[var(--container-bg)]'
              }`}
            >
              <span className="flex items-center gap-2">
                <img src="/flags/gb.svg" alt="" className="w-5 h-4" />
                ENG
              </span>
              {language === 'en' && <span>✓</span>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
