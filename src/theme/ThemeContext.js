// 主题上下文：三选（跟随系统 / 浅色 / 深色），镜像 LanguageContext。
// 'system' 用 RN 的 useColorScheme() 实时跟随系统深浅色。
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors } from '../theme';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'timeflow_theme';

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();         // 'light' | 'dark' | null
  const [mode, setMode] = useState('system');    // 用户偏好：system / light / dark
  const [hydrated, setHydrated] = useState(false);

  // 水合：读回上次选择；缺失 = 跟随系统
  useEffect(() => {
    (async () => {
      let saved = null;
      try { saved = await AsyncStorage.getItem(STORAGE_KEY); } catch (e) {}
      setMode(saved === 'light' || saved === 'dark' ? saved : 'system');
      setHydrated(true);
    })();
  }, []);

  // value: 'system' | 'light' | 'dark'
  const setTheme = useCallback(async (value) => {
    if (value === 'light' || value === 'dark') {
      setMode(value);
      try { await AsyncStorage.setItem(STORAGE_KEY, value); } catch (e) {}
    } else {
      setMode('system');
      try { await AsyncStorage.removeItem(STORAGE_KEY); } catch (e) {}
    }
  }, []);

  const isSystem = mode === 'system';
  const isDark = isSystem ? systemScheme === 'dark' : mode === 'dark';
  const theme = isDark ? 'dark' : 'light';       // 实际生效主题
  const colors = isDark ? darkColors : lightColors;

  const value = useMemo(
    () => ({ theme, mode, isSystem, isDark, setTheme, colors, hydrated }),
    [theme, mode, isSystem, isDark, setTheme, colors, hydrated]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
