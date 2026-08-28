import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';

export default function PrivacyAgreement({ onClose }) {
  const insets = useSafeAreaInsets();
  const { lang } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const CONTENT = lang === 'zh' ? CONTENT_ZH : CONTENT_EN;

  return (
    <View style={styles.screen}>
      <View style={[styles.nav, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.back} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>{CONTENT.title}</Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>{CONTENT.h1}</Text>
        <Text style={styles.date}>{CONTENT.date}</Text>
        <Text style={styles.p}>{CONTENT.intro}</Text>
        {CONTENT.sections.map(([h, body]) => (
          <View key={h} style={styles.block}>
            <Text style={styles.h2}>{h}</Text>
            <Text style={styles.pBody}>{body}</Text>
          </View>
        ))}
        <Text style={styles.footer}>{CONTENT.footer}</Text>
      </ScrollView>
    </View>
  );
}

const CONTENT_ZH = {
  title: '隐私协议',
  h1: 'TimeFlow 隐私政策',
  date: '更新日期：2026 年 8 月 27 日',
  intro: 'TimeFlow（时光流）尊重并保护你的个人隐私。本政策说明我们如何处理你的信息，请在使用前仔细阅读。',
  sections: [
    ['一、我们收集的信息', '1. 位置：仅在你主动打卡时，读取当前位置坐标，用于记录打卡地点。\n2. 时间与出行方式：打卡时刻、你选择的出行方式（步行/骑行/驾车/公交）。\n3. 你主动填写的内容：地点名（如「家」「公司」）、昵称等。'],
    ['二、信息存储', '所有信息均仅存储在你手机的本地存储中（系统安全存储区域），本应用没有服务器。获取打卡位置时，若使用高德定位能力，定位请求会发送给高德地图定位 SDK；当你在「我的 → 位置服务」配置了高德 Web服务 Key 后，打卡坐标会发送给高德地图用于反查附近地名。你的数据不会被上传、分享或传输给其它任何第三方。'],
    ['三、信息使用', '你的信息仅用于向你展示：今日行程、路段耗时统计、打卡记录。不作任何其他用途。'],
    ['四、权限', '定位权限：仅在你打卡时请求，用于获取坐标。即使拒绝授权，其他功能仍可正常使用，届时打卡地点显示为「未命名」。'],
    ['五、你的权利', '你可以在「我的 → 数据管理」中随时导出或清空全部数据。清空后数据不可恢复，请谨慎操作。'],
    ['六、未成年人', '本应用不面向 13 周岁以下儿童收集任何个人信息。'],
    ['七、政策变更', '若本政策有任何更新，我们会在应用内展示最新版本。继续使用即视为接受更新后的政策。'],
    ['八、联系我们', '如对本隐私政策有任何疑问，欢迎通过邮件联系我们：chaseli9@gmail.com'],
  ],
  footer: '感谢你使用 TimeFlow。',
};

const CONTENT_EN = {
  title: 'Privacy Policy',
  h1: 'TimeFlow Privacy Policy',
  date: 'Last updated: Aug 27, 2026',
  intro: 'TimeFlow respects and protects your privacy. This policy explains how we handle your information. Please read it carefully before use.',
  sections: [
    ['1. Information we collect', '1. Location: only when you check in, we read your current coordinates to record the place.\n2. Time and transport: the check-in time and your chosen mode (walk/bike/drive/transit).\n3. Information you enter: place names (e.g. "Home", "Office"), nickname, etc.'],
    ['2. Data storage', 'All data is stored only in your phone’s local storage (system secure area); this app has no server. When capturing a check-in location, if the Amap location capability is used, the location request is sent to the Amap location SDK; and if you set an Amap Web Service key under Profile → Location service, check-in coordinates are sent to Amap to look up a nearby place name. Your data is never uploaded, shared, or transmitted to any other third party.'],
    ['3. Data usage', 'Your data is used solely to show you: today’s trips, route duration statistics, and check-in records. No other purpose.'],
    ['4. Permissions', 'Location permission is requested only when you check in, to get coordinates. Even if denied, other features still work; the place will then show as "Unnamed".'],
    ['5. Your rights', 'You can export or clear all data anytime under Profile → Data. Cleared data cannot be recovered, so please be careful.'],
    ['6. Minors', 'This app does not collect any personal information from children under 13.'],
    ['7. Policy changes', 'If this policy is updated, the latest version will be shown in the app. Continued use means you accept the updated policy.'],
    ['8. Contact', 'For any questions about this policy, email us at: chaseli9@gmail.com'],
  ],
  footer: 'Thank you for using TimeFlow.',
};

const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingBottom: 10,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  content: { padding: 20, paddingBottom: 48 },
  h1: { fontSize: 22, fontWeight: '800', color: colors.ink },
  date: { fontSize: 13, color: colors.ink3, marginTop: 4, marginBottom: 12 },
  p: { fontSize: 14, color: colors.ink2, lineHeight: 22, marginBottom: 4 },
  block: { marginTop: 22 },
  h2: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  pBody: { fontSize: 14, color: colors.ink2, lineHeight: 23 },
  footer: { marginTop: 32, fontSize: 13, color: colors.ink3, textAlign: 'center' },
});
