// 清空确认（设计稿 danger：居中弹窗，输入「清空」才激活红色按钮）。
// 执行链路由父级 onConfirm 完成：safe 备份 → clearAll → toast。
import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../../i18n/LanguageContext';
import { useTheme } from '../../theme/ThemeContext';
import { SafeNote } from './Buttons';

export default function ClearConfirmModal({ visible, totalCount, busy, onClose, onConfirm }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [input, setInput] = useState('');

  useEffect(() => { if (visible) setInput(''); }, [visible]);

  const word = t('clear.word');
  const armed = input.trim() === word;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={busy ? () => {} : onClose}>
      <TouchableOpacity style={[styles.overlay, { backgroundColor: colors.scrim }]} activeOpacity={1} onPress={busy ? () => {} : onClose}>
        <View style={[styles.dialog, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
          <Text style={[styles.title, { color: colors.ink }]}>{t('clear.title')}</Text>
          <Text style={[styles.body, { color: colors.ink2 }]}>{t('clear.body', { n: totalCount })}</Text>
          <SafeNote text={t('clear.safeNote')} />
          <TextInput
            style={[styles.input, { backgroundColor: colors.chip, borderColor: colors.line, color: colors.ink }]}
            value={input}
            onChangeText={setInput}
            placeholder={t('clear.inputHint')}
            placeholderTextColor={colors.ink3}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.chip }]}
              onPress={onClose}
              disabled={busy}
              activeOpacity={0.7}
            >
              <Text style={[styles.btnText, { color: colors.ink2 }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.err, opacity: armed && !busy ? 1 : 0.4 }]}
              onPress={armed && !busy ? onConfirm : undefined}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnText, { color: '#FFFFFF' }]}>{busy ? '…' : t('clear.confirm')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  dialog: { width: '100%', maxWidth: 380, borderRadius: 20, padding: 20 },
  title: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8, marginBottom: 12 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14.5, marginTop: 12 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 14.5, fontWeight: '700' },
});
