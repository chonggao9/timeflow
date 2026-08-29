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
  date: '更新日期：2026 年 8 月 29 日',
  intro: 'TimeFlow（时光流）尊重并保护你的个人信息。本政策依据适用的法律法规制定，请在使用前仔细阅读、充分理解。',
  sections: [
    ['一、我们收集的信息', '我们仅处理实现功能所必需的最少信息（最小必要原则）：\n1. 位置信息（敏感个人信息）：仅在你主动打卡时，读取当前位置的经纬度坐标，用于记录打卡地点。\n2. 时间信息：打卡发生的具体时间。\n3. 出行方式：你选择的出行方式（步行/骑行/驾车/公交）。\n4. 你主动填写的内容：地点名（如「家」「公司」）、昵称等。\n我们不收集与上述功能无关的信息。'],
    ['二、第三方 SDK 及信息共享', '为实现定位功能，本应用集成了高德开放平台定位 SDK，相关信息披露如下：\n• 使用 SDK 名称：高德开放平台定位 SDK\n• 第三方名称：北京高德图强科技有限公司\n• 使用目的：为了向你提供定位服务\n• 收集个人信息：经纬度、设备信息（如 IP 地址、GNSS 信息、网络类型、WiFi 状态、WiFi 参数、WiFi 列表、WiFi 信号强度、WiFi 网关地址、SSID、BSSID、基站信息、传感器信息、设备信号强度信息）、OAID、当前应用信息（应用名、应用版本号）、设备参数及系统信息（设备品牌及型号、操作系统、运营商信息、屏幕分辨率）\n• 信息收集方式：SDK 本机采集\n• 第三方隐私政策：https://lbs.amap.com/pages/privacy/\n除上述高德 SDK 外，本应用没有服务器，不会将你的个人信息上传、分享或提供给任何其他第三方。若你在「我的 → 位置服务」配置了高德 Web 服务 Key，打卡坐标会发送给高德地图用于反查附近地名，同样受高德隐私政策约束。'],
    ['三、信息的存储与安全', '1. 存储位置：所有个人信息均仅存储在你自己手机的本机存储中，本应用没有服务器、不上传云端。\n2. 加密传输：打卡坐标在通过高德 SDK 定位及反查地名时，均使用 HTTPS 加密传输；本地数据存储于应用沙盒内。\n3. 存储期限：自你保存起保留，直至你主动清空数据或卸载本应用时删除。\n4. 安全措施：依赖系统提供的沙盒隔离与访问控制机制保护数据，无账号体系、无云端同步。'],
    ['四、信息的使用', '你的信息仅用于向你展示：今日行程、历史行程、路段耗时统计、打卡记录。我们不会将你的信息用于任何其他用途，也不会进行自动化决策或用户画像。'],
    ['五、设备权限', '定位权限：仅在你打卡时请求，用于获取坐标。即使拒绝授权，其他功能仍可正常使用，届时打卡地点显示为「未命名」。你可以随时在系统设置中关闭该权限。'],
    ['六、你的权利与撤回同意', '依据法律，你对自己的个人信息享有以下权利：\n1. 查阅、复制、更正：可在应用内直接查看和修改地点名、昵称等。\n2. 删除：可在「我的 → 数据管理」中随时删除或清空全部数据。\n3. 导出：可在「我的 → 数据管理」中导出全部数据。\n4. 撤回同意：可随时在系统设置中关闭定位权限，或清空数据。撤回同意不影响撤回前已进行的处理。'],
    ['七、未成年人保护', '本应用不面向未满 13 周岁的儿童收集个人信息。如你未满 13 周岁，请在监护人指导下使用，并由监护人阅读本政策。'],
    ['八、政策更新', '如本政策发生变更，我们会在应用内展示最新版本，重大变更将以显著方式提示你。继续使用即视为你接受更新后的政策。'],
    ['九、联系我们', '如对本隐私政策有任何疑问、意见或建议，欢迎通过邮件联系我们：chonggao9@gmail.com'],
  ],
  footer: '感谢你使用 TimeFlow。',
};

const CONTENT_EN = {
  title: 'Privacy Policy',
  h1: 'TimeFlow Privacy Policy',
  date: 'Last updated: Aug 29, 2026',
  intro: 'TimeFlow respects and protects your personal information. This policy is drafted in accordance with applicable laws and regulations. Please read and fully understand it before use.',
  sections: [
    ['1. Information we collect', 'We process only the minimum information necessary to provide the functions (data minimization):\n1. Location (sensitive personal information): only when you check in, we read your current coordinates to record the place.\n2. Time: the exact time of each check-in.\n3. Transport mode: your chosen mode (walk / bike / drive / transit).\n4. Information you enter: place names (e.g. "Home", "Office"), nickname, etc.\nWe do not collect any information unrelated to the above functions.'],
    ['2. Third-party SDK & sharing', 'To provide location services, this app integrates the Amap Open Platform Location SDK, disclosed as follows:\n• SDK name: Amap Open Platform Location SDK\n• Third party: Beijing Amap Tuqiang Technology Co., Ltd.\n• Purpose: to provide you with location services\n• Information collected: latitude/longitude, device information (such as IP address, GNSS info, network type, Wi-Fi status/parameters/list/signal strength, Wi-Fi gateway address, SSID, BSSID, base station info, sensor info, device signal strength), OAID, current app info (app name, app version), device parameters and system info (device brand/model, OS, carrier, screen resolution)\n• Collection method: collected locally by the SDK\n• Third-party privacy policy: https://lbs.amap.com/pages/privacy/\nExcept for the Amap SDK above, this app has no server and never uploads, shares, or provides your personal information to any other third party. If you configure an Amap Web Service key under Profile → Location service, check-in coordinates are sent to Amap to look up a nearby place name, also subject to Amap’s privacy policy.'],
    ['3. Data storage & security', '1. Location: all personal information is stored only in your phone’s local storage; this app has no server and does not upload to the cloud.\n2. Encryption in transit: check-in coordinates are transmitted over HTTPS when using the Amap SDK for location and reverse geocoding; local data is stored in the app sandbox.\n3. Retention: kept from the time you save it until you clear the data or uninstall the app.\n4. Security: protected by the system’s sandbox isolation and access controls; no account system and no cloud sync.'],
    ['4. Data usage', 'Your data is used solely to show you: today’s trips, history, route duration statistics, and check-in records. We do not use it for any other purpose, nor for automated decision-making or profiling.'],
    ['5. Permissions', 'Location permission is requested only when you check in, to get coordinates. Even if denied, other features still work; the place will then show as "Unnamed". You can revoke this permission anytime in system settings.'],
    ['6. Your rights & withdrawing consent', 'Under the law, you have the following rights over your personal information:\n1. Access, copy, correct: you can view and edit place names, nickname, etc. in the app.\n2. Delete: you can delete or clear all data anytime under Profile → Data.\n3. Export: you can export all data under Profile → Data.\n4. Withdraw consent: you can turn off location permission in system settings or clear your data at any time. Withdrawal does not affect processing already carried out before the withdrawal.'],
    ['7. Minors', 'This app does not collect personal information from children under 13. If you are under 13, please use it under the guidance of a guardian, who should read this policy.'],
    ['8. Policy changes', 'If this policy is updated, the latest version will be shown in the app, and significant changes will be highlighted. Continued use means you accept the updated policy.'],
    ['9. Contact', 'For any questions, comments, or suggestions about this policy, email us at: chonggao9@gmail.com'],
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
