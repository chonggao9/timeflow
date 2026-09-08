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
  date: '更新日期：2026 年 9 月 8 日 · 生效日期：2026 年 9 月 8 日',
  intro: 'TimeFlow（时光流）高度重视用户隐私与个人数据安全。本政策依据适用的法律法规与 Google Play 开发者政策制定，请在使用前仔细阅读、充分理解。',
  sections: [
    ['一、我们处理的信息（最小必要原则）', 'TimeFlow 坚持「数据本地优先与最小必要」原则：\n1. 位置信息（敏感个人信息）：仅在主动点击打卡时，于前台读取一次当前经纬度坐标与大致地名。TimeFlow 绝不在后台静默追踪您的实时位置，不使用后台定位权限（ACCESS_BACKGROUND_LOCATION）。若拒绝授权，仍可正常使用手动打卡功能。\n2. 时间信息：打卡发生的时间戳。\n3. 出行方式与标签：自主选择的出行方式、地点别名（如「家」「公司」）或打卡备注。\n4. 配置偏好：语言、外观主题及 WebDAV 配置。\n除上述功能必需项外，本应用不收集通讯录、短信、相册或设备唯一标识符（IMEI/IMSI）。'],
    ['二、第三方组件及系统服务披露', '为提供稳定定位与逆地理编码能力，本应用集成如下组件：\n• 高德开放平台定位 SDK（北京高德图强科技有限公司）：用于中国大陆地区定位与地名反查，在打卡时采集经纬度、网络及传感器参数，详见其隐私政策：https://lbs.amap.com/pages/privacy/\n• Android 系统 / Google Play 服务定位接口（Google LLC）：用于海外或具备 Google 服务的设备调用原生融合定位与地理反查。\n特别声明：TimeFlow 没有自建业务服务器，未集成任何第三方商业广告 SDK 或用户行为追踪 SDK（如 Google Analytics、Firebase 等），绝不售卖或向第三方共享您的个人隐私。'],
    ['三、信息的存储与安全', '1. 全本地存储（Local-First）：所有打卡数据默认且仅存储在您手机本地的应用沙盒（SQLite 数据库）中，数据所有权 100% 归您所有。\n2. 加密传输：坐标与地名查询均走 HTTPS 加密传输。\n3. WebDAV 云备份强加密：若配置 WebDAV 同步，备份数据在离开手机前将基于您的私有口令经 PBKDF2 派生密钥进行 AES-256-CBC 强加密，直接上传至您指定的私有网盘（如 Nextcloud、坚果云），开发者与第三方均无法解密。'],
    ['四、信息的使用', '您的信息仅在本地用于呈现今日时间轴、历史行程、路段耗时规律与图谱洞察。我们不将您的信息用于广告推送、画像追踪或商业化自动化决策。'],
    ['五、设备权限', '前台位置权限仅在打卡瞬时请求，可随时在系统设置中关闭，关闭后打卡仍可使用（地名默认显示「未命名」）。本应用不申请、不使用任何后台静默定位权限。'],
    ['六、您的权利与数据删除机制', '您对自己的数据拥有完整掌控权：\n1. 单条删除：在首页时间轴中左滑或点击删除任意记录。\n2. 全量清空：在「我的 → 数据管理与备份 → 清空所有打卡记录」或「洞察 → 历史」中随时一键抹除本地全部数据（不可逆）。\n3. 卸载物理清除：卸载应用将物理彻底擦除本应用沙盒内的全部数据库文件与配置。\n4. 云端删除：可在 WebDAV 网盘中直接删除 .tfbak 备份文件，或在 App 内清除配置与口令。\n5. 权利行使：若有任何疑问或协助需求，可致信开发者邮箱 chonggao9@gmail.com。'],
    ['七、未成年人保护', 'TimeFlow 主要面向成年人与通勤人群，不以未满 13 周岁的儿童为目标受众，不主动收集儿童个人信息。'],
    ['八、政策更新', '如本政策发生变更，我们会在应用内展示最新版本，重大变更将以显著方式提示您。继续使用即视为接受更新后的政策。'],
    ['九、联系我们', '如有任何隐私疑问或反馈，欢迎通过邮件联系我们：chonggao9@gmail.com'],
  ],
  footer: '感谢你使用 TimeFlow。',
};

const CONTENT_EN = {
  title: 'Privacy Policy',
  h1: 'TimeFlow Privacy Policy',
  date: 'Last Updated: Sep 8, 2026 · Effective Date: Sep 8, 2026',
  intro: 'TimeFlow respects and protects your personal privacy. This policy is formulated in compliance with applicable data protection laws and Google Play Developer Policies. Please read carefully before use.',
  sections: [
    ['1. Information We Process (Data Minimization)', 'TimeFlow adheres strictly to the "local-first" and minimal necessity principles:\n1. Location (Sensitive Personal Information): Accessed ONLY in the foreground upon explicit check-in tap to log your milestone. TimeFlow NEVER tracks your location silently in the background, and does NOT request or use background location permission (ACCESS_BACKGROUND_LOCATION). If denied, manual logging remains fully functional.\n2. Timestamp: The exact time of check-in.\n3. Travel Mode & Labels: Your selected transport mode, place aliases (e.g. "Home", "Office"), and notes.\n4. App Settings: Language, theme, and optional WebDAV configuration.\nWe do NOT collect contacts, SMS, photos, hardware IDs (IMEI/IMSI), or any sensitive data unrelated to milestone tracking.'],
    ['2. Third-Party SDKs & Services', 'To provide reliable location retrieval, TimeFlow integrates:\n• Amap Location SDK (Beijing Amap Tuqiang Technology Co., Ltd.): used for location and geocoding in mainland China, collecting coordinates and device sensor parameters upon check-in: https://lbs.amap.com/pages/privacy/\n• Android System / Google Play Services Location (Google LLC): used for native fused positioning and reverse geocoding on devices equipped with Google services.\nSpecial Disclosure: TimeFlow has NO backend servers, NO advertising SDKs, and NO behavioral analytics/tracking SDKs (such as Google Analytics, Firebase, etc.). We never sell or share your data.'],
    ['3. Storage, Encryption & Security', '1. 100% Local-First: All records and statistics reside strictly in your device local application sandbox (SQLite database).\n2. Encryption in Transit: Lookups are transmitted over HTTPS.\n3. WebDAV Cloud Sync & AES-256: If WebDAV is enabled, backups are strongly encrypted locally with AES-256-CBC (via PBKDF2 with your private passphrase) before direct transmission to your self-hosted server. The developer cannot decrypt your data.'],
    ['4. Purpose of Data Use', 'Your data is used solely on your local device to generate your daily timeline, trip history, and commute duration patterns. We do not use it for advertising, profiling, or automated assessment.'],
    ['5. Device Permissions', 'Foreground location permission is requested only at the moment of check-in and can be revoked anytime in system settings without breaking core manual logging. TimeFlow does NOT declare or use background location.'],
    ['6. Your Rights & Data Deletion', 'You have full control over your data:\n1. Granular Deletion: Swipe or tap to delete any single milestone directly from the timeline.\n2. Complete Wipe: Go to "Profile → Data & Cloud Backup → Clear All Check-In Records" or "Insights → History" to permanently erase all local records with one tap.\n3. System Uninstall: Uninstalling the app permanently purges all local sandbox database files via the OS.\n4. Cloud Deletion: Delete .tfbak files directly on your WebDAV server or clear credentials in-app.\n5. Inquiries: Email chonggao9@gmail.com for any data deletion or privacy assistance.'],
    ['7. Children’s Privacy', 'TimeFlow is intended for general audiences and adult commuters. We do not knowingly collect personal information from children under 13.'],
    ['8. Policy Updates', 'If this policy changes, the latest version will be presented here with an updated date. Continued use signifies acceptance.'],
    ['9. Contact Us', 'For any privacy questions or requests, contact us at: chonggao9@gmail.com'],
  ],
  footer: 'Thank you for choosing TimeFlow.',
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
