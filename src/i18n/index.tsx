import React, { createContext, useContext, useState, useEffect } from 'react';
import zhTW from './locales/zh-TW';
import zhCN from './locales/zh-CN';
import en from './locales/en';
import ja from './locales/ja';
import ko from './locales/ko';

export type Locale = 'zh-TW' | 'zh-CN' | 'en' | 'ja' | 'ko';

type Translations = typeof zhTW;

const translations: Record<Locale, Record<string, string>> = {
  'zh-TW': zhTW,
  'zh-CN': zhCN,
  'en': en,
  'ja': ja,
  'ko': ko,
};

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: keyof Translations) => string;
}

const I18nContext = createContext(undefined as any);

const STORAGE_KEY = 'i18n-locale';

// 偵測系統語言
function detectLocale(): Locale {
  // 先從 localStorage 讀取
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && (saved === 'zh-TW' || saved === 'zh-CN' || saved === 'en' || saved === 'ja' || saved === 'ko')) {
    return saved as Locale;
  }

  // 偵測瀏覽器語言
  const browserLang = navigator.language || (navigator as any).userLanguage;
  
  // 簡化語言代碼（例如 'zh-TW' -> 'zh-TW', 'zh-CN' -> 'zh-CN'）
  if (browserLang.startsWith('zh')) {
    if (browserLang.includes('TW') || browserLang.includes('HK') || browserLang.includes('MO')) {
      return 'zh-TW';
    }
    return 'zh-CN';
  }
  
  if (browserLang.startsWith('ja')) {
    return 'ja';
  }
  
  if (browserLang.startsWith('ko')) {
    return 'ko';
  }
  
  // 預設為英文
  return 'en';
}

export function I18nProvider({ children }: { children: any }) {
  const [locale, setLocaleState] = useState(() => detectLocale());

  useEffect(() => {
    // 初始化時從 localStorage 讀取
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (saved === 'zh-TW' || saved === 'zh-CN' || saved === 'en' || saved === 'ja' || saved === 'ko')) {
      setLocaleState(saved as Locale);
    } else {
      // 如果沒有保存的語言，使用偵測到的語言
      const detected = detectLocale();
      setLocaleState(detected);
      localStorage.setItem(STORAGE_KEY, detected);
    }
  }, []);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
  };

  const t = (key: keyof Translations): string => {
    const translation = translations[locale][key];
    return translation || key;
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

