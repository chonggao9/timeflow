// 备份 UI 专用轻提示：useToast() 返回 { show, node }，node 挂在页面根 View 末尾。
// 仅限新备份界面使用，不做全局 Toast 重构。
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export function useToast() {
  const { colors } = useTheme();
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const show = useCallback((text) => {
    if (!text) return;
    setMsg(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2200);
  }, []);

  const node = msg ? (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 90, alignItems: 'center', zIndex: 999 }}>
      <View style={{
        maxWidth: '85%', backgroundColor: 'rgba(43,35,30,0.88)', borderRadius: 12,
        paddingHorizontal: 16, paddingVertical: 10,
      }}>
        <Text style={{ color: '#FFF', fontSize: 13.5, fontWeight: '500', lineHeight: 19 }}>{msg}</Text>
      </View>
    </View>
  ) : null;

  return { show, node, colors };
}
