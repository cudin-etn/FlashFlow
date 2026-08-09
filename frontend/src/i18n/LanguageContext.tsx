// src/i18n/LanguageContext.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { resources, LanguageCode } from './locales';

/**
 * Standalone translate function — can be used outside React context for testing.
 * Returns the translation for the given key and locale, or the key itself if not found.
 * NEVER returns an empty string.
 */
export function translate(key: string, locale: LanguageCode): string {
  const dict = resources[locale] as Record<string, string>;
  const value = dict[key];
  // Fallback: return key itself if translation is missing or empty
  if (value && value.length > 0) return value;
  return key;
}

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  // Lấy ngôn ngữ đã lưu hoặc mặc định là tiếng Việt
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    return (localStorage.getItem('app_language') as LanguageCode) || 'vi';
  });

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(lang);
    localStorage.setItem('app_language', lang);
  };

  // Hàm dịch (t) — uses standalone translate function
  const t = (key: string): string => {
    return translate(key, language);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within a LanguageProvider");
  return context;
};