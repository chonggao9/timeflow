import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { translations } from './translations';

const LangContext = createContext(null);
const STORAGE_KEY = 'timeflow_lang';

// 从系统语言推断：主要支持 zh / en，其它回退 en
function systemLang() {
  try {
    const locales = Localization.getLocales?.();
    if (Array.isArray(locales) && locales.length > 0 && locales[0]?.languageCode) {
      const code = locales[0].languageCode.toLowerCase();
      return code.startsWith('zh') ? 'zh' : 'en';
    }
    const legacyLocale = Localization.locale || (typeof globalThis !== 'undefined' && globalThis.navigator?.language) || '';
    if (legacyLocale && typeof legacyLocale === 'string' && legacyLocale.toLowerCase().startsWith('zh')) {
      return 'zh';
    }
    return 'en';
  } catch (e) {
    return 'en';
  }
}

export function LanguageProvider({ children }) {
  // 首次安装/启动时，首帧同步跟随系统语言，杜绝冷启动闪现默认语言
  const [lang, setLangState] = useState(() => systemLang()); // 实际生效语言：zh / en
  const [isSystem, setIsSystem] = useState(true);            // 是否跟随系统

  useEffect(() => {
    let isMounted = true;
    (async () => {
      let saved = null;
      try { saved = await AsyncStorage.getItem(STORAGE_KEY); } catch (e) {}
      if (!isMounted) return;
      if (saved === 'zh' || saved === 'en') {
        setLangState(saved);
        setIsSystem(false);
      } else {
        setLangState(systemLang());
        setIsSystem(true);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // 当处于跟随系统模式时，切回前台自动与系统语言同步
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && isSystem) {
        setLangState(systemLang());
      }
    });
    return () => sub?.remove?.();
  }, [isSystem]);

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
