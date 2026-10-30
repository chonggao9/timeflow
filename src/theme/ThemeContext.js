// 主题与皮肤上下文：
// 1. 外观（跟随系统 / 浅色 / 深色）
// 2. 皮肤（coral, ocean, forest, lavender, journal, oled）
// 两者正交叠加：皮肤决定色系，外观决定浅色/深色版本。
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createThemeColors } from '../theme';
import { SKINS, SKIN_LIST, DEFAULT_SKIN } from './skins';
import { refreshAllWidgets } from '../utils/widgetRefresh';

const ThemeContext = createContext(null);
const STORAGE_KEY_MODE = 'timeflow_theme';
const STORAGE_KEY_SKIN = 'timeflow_skin';

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null
  const [mode, setMode] = useState('system'); // 用户偏好：system / light / dark
  const [skin, setSkinState] = useState(DEFAULT_SKIN); // 用户皮肤偏好
  const [hydrated, setHydrated] = useState(false);

  // 水合：读回上次选择
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [savedMode, savedSkin] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_MODE),
          AsyncStorage.getItem(STORAGE_KEY_SKIN),
        ]);
        if (cancelled) return;
        if (savedMode === 'light' || savedMode === 'dark') {
          setMode(savedMode);
        } else {
          setMode('system');
        }
        if (savedSkin && SKINS[savedSkin]) {
          setSkinState(savedSkin);
        } else {
          setSkinState(DEFAULT_SKIN);
          if (savedSkin) {
            // 旧皮肤迁移为 coral 并写回存储
            AsyncStorage.setItem(STORAGE_KEY_SKIN, DEFAULT_SKIN).catch(() => {});
          }
        }
      } catch (e) {
        // 兜底保持默认
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    const t = setTimeout(() => { if (!cancelled) setHydrated(true); }, 800);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  // 监听外观变化（包含系统深浅色自动切换与手动切换）：触发小组件刷新
  const lastDarkRef = React.useRef(null);
  useEffect(() => {
    if (!hydrated) return;
    if (lastDarkRef.current === null) {
      lastDarkRef.current = isDark;
      return;
    }
    if (lastDarkRef.current !== isDark) {
      lastDarkRef.current = isDark;
      refreshAllWidgets().catch(() => {});
    }
  }, [isDark, hydrated]);

  // 切换外观：value: 'system' | 'light' | 'dark'
  const setTheme = useCallback(async (value) => {
    if (value === 'light' || value === 'dark') {
      setMode(value);
      try { await AsyncStorage.setItem(STORAGE_KEY_MODE, value); } catch (e) {}
    } else {
      setMode('system');
      try { await AsyncStorage.removeItem(STORAGE_KEY_MODE); } catch (e) {}
    }
    refreshAllWidgets().catch(() => {});
  }, []);

  // 切换皮肤：skinId: string
  const setSkin = useCallback(async (skinId) => {
    if (SKINS[skinId]) {
      setSkinState(skinId);
      try { await AsyncStorage.setItem(STORAGE_KEY_SKIN, skinId); } catch (e) {}
      refreshAllWidgets().catch(() => {});
    }
  }, []);

  const isSystem = mode === 'system';
  const isDark = isSystem ? systemScheme === 'dark' : mode === 'dark';
  const theme = isDark ? 'dark' : 'light';

  // 动态生成包含统一核心 Token 与兼容别名的颜色对象
  const colors = useMemo(() => createThemeColors(skin, isDark), [skin, isDark]);

  const value = useMemo(
    () => ({
      theme,
      mode,
      skin,
      skins: SKIN_LIST,
      isSystem,
      isDark,
      setTheme,
      setSkin,
      colors,
      hydrated,
    }),
    [theme, mode, skin, isSystem, isDark, setTheme, setSkin, colors, hydrated]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
