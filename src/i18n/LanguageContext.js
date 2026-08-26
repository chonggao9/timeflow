import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { translations } from './translations';

const LangContext = createContext(null);
const STORAGE_KEY = 'timeflow_lang';

// 从系统语言推断：主要支持 zh / en，其它回退 en
function systemLang() {
  try {
    const code = Localization.getLocales?.()?.[0]?.languageCode;
    if (!code) return 'en';
    return code.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch (e) {
    return 'en';
  }
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState('zh');       // 实际生效语言：zh / en
  const [isSystem, setIsSystem] = useState(true);     // 是否跟随系统

  useEffect(() => {
    (async () => {
      let saved = null;
      try { saved = await AsyncStorage.getItem(STORAGE_KEY); } catch (e) {}
      if (saved === 'zh' || saved === 'en') {
        setLangState(saved);
        setIsSystem(false);
      } else {
        setLangState(systemLang());
        setIsSystem(true);
      }
    })();
  }, []);

  // value: 'zh' | 'en' | 'system'
  const setLang = useCallback(async (value) => {
    if (value === 'system') {
      setIsSystem(true);
      setLangState(systemLang());
      try { await AsyncStorage.removeItem(STORAGE_KEY); } catch (e) {}
    } else {
      setIsSystem(false);
      setLangState(value);
      try { await AsyncStorage.setItem(STORAGE_KEY, value); } catch (e) {}
    }
  }, []);

  const t = useCallback((key, params) => {
    let str = translations[lang]?.[key] ?? translations.zh[key] ?? key;
    if (params) {
      for (const k in params) str = str.replace(`{${k}}`, params[k]);
    }
    return str;
  }, [lang]);

  const formatDate = useCallback((d) => {
    const wdZh = ['周日','周一','周二','周三','周四','周五','周六'];
    const wdEn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const moEn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (lang === 'zh') {
      return `${d.getMonth() + 1}月${d.getDate()}日 · ${wdZh[d.getDay()]}`;
    }
    return `${moEn[d.getMonth()]} ${d.getDate()} · ${wdEn[d.getDay()]}`;
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, isSystem, setLang, t, formatDate }}>
      {children}
    </LangContext.Provider>
  );
}

export function useI18n() {
  return useContext(LangContext);
}
