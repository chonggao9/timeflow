// 通用底部弹层壳（设计稿 sheet：顶部圆角 26、白卡、遮罩点击关闭）。
import React from 'react';
import { Modal, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export default function Sheet({ visible, onClose, children }) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: colors.scrim }}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            backgroundColor: colors.surface,
            borderTopLeftRadius: 26, borderTopRightRadius: 26,
            paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28,
            maxHeight: '86%',
          }}
          onStartShouldSetResponder={() => true}
        >
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line2, marginBottom: 12 }} />
          {children}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
