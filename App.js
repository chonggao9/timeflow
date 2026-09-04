import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Alert, Linking, Platform, View, Text, Modal, TouchableOpacity, StyleSheet, BackHandler } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as NavigationBar from 'expo-navigation-bar';
import HomeScreen from './src/screens/HomeScreen';
import InsightsScreen from './src/screens/InsightsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import PrivacyAgreement from './src/screens/PrivacyAgreement';
import { LanguageProvider, useI18n } from './src/i18n/LanguageContext';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { checkForUpdate } from './src/utils/updater';
import { runBackupIfDue } from './src/backup/schedule';

const Tab = createBottomTabNavigator();

function TabNavigator() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.line,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: t('tab.checkin'),
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'time' : 'time-outline'} size={24} color={focused ? colors.primary : colors.ink3} />
          ),
        }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsScreen}
        options={{
          tabBarLabel: t('tab.insights'),
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'stats-chart' : 'stats-chart-outline'} size={24} color={focused ? colors.primary : colors.ink3} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: t('tab.profile'),
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={focused ? colors.primary : colors.ink3} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const PRIVACY_KEY = 'timeflow_privacy_agreed';

function PrivacyModal({ visible, onAgree }) {
  const { colors } = useTheme();
  const { lang } = useI18n();
  const [showDoc, setShowDoc] = useState(false);
  const isZh = lang === 'zh';

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={[privacyStyles.overlay, { backgroundColor: colors.scrim }]}>
        <View style={[privacyStyles.box, { backgroundColor: colors.surface }]}>
          <Text style={[privacyStyles.title, { color: colors.ink }]}>
            {isZh ? '隐私政策与权限提示' : 'Privacy & Permissions Notice'}
          </Text>
          <Text style={[privacyStyles.content, { color: colors.ink2 }]}>
            {isZh
              ? '欢迎使用 TimeFlow（时光流）！在您使用前，请充分阅读并理解相关条款：\n\n' +
                '1. 个人数据最小化：仅在您主动点击打卡时，读取当前经纬度与时间，所有记录默认仅存储于手机本地沙盒，无中心化服务器。\n' +
                '2. 第三方 SDK：为了获取精确坐标，应用集成了高德开放平台定位 SDK，将在打卡时采集必要的位置与设备参数。\n' +
                '3. 自主备份：若配置 WebDAV，数据将以强加密形式传输至您自有的云端。'
              : 'Welcome to TimeFlow! Please read and understand our terms before using:\n\n' +
                '1. Data Minimization: Coordinates and time are read ONLY when you explicitly check in. Data stays on your local device.\n' +
                '2. Third-Party SDK: Integrated with Amap Location SDK to provide accurate location during check-in.\n' +
                '3. Data Ownership: If WebDAV is enabled, backups are strongly encrypted and stored on your own cloud.'}
          </Text>

          <TouchableOpacity
            style={privacyStyles.linkWrap}
            onPress={() => setShowDoc(true)}
            activeOpacity={0.7}
          >
            <Text style={[privacyStyles.link, { color: colors.primary }]}>
              {isZh ? '查看完整《隐私政策》 >' : 'View Full Privacy Policy >'}
            </Text>
          </TouchableOpacity>

          <View style={privacyStyles.btnRow}>
            <TouchableOpacity
              style={[privacyStyles.btn, { backgroundColor: colors.chip }]}
              onPress={() => {
                if (Platform.OS === 'android') BackHandler.exitApp();
              }}
              activeOpacity={0.7}
            >
              <Text style={[privacyStyles.btnText, { color: colors.ink3 }]}>
                {isZh ? '不同意并退出' : 'Disagree & Exit'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[privacyStyles.btn, { backgroundColor: colors.primary }]}
              onPress={onAgree}
              activeOpacity={0.8}
            >
              <Text style={[privacyStyles.btnText, { color: '#FFFFFF', fontWeight: '700' }]}>
                {isZh ? '同意并继续' : 'Agree & Continue'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal visible={showDoc} animationType="slide" onRequestClose={() => setShowDoc(false)}>
        <PrivacyAgreement onClose={() => setShowDoc(false)} />
      </Modal>
    </Modal>
  );
}

const privacyStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  box: {
    width: '100%',
    borderRadius: 20,
    padding: 22,
    maxWidth: 400,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },
  content: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },
  linkWrap: {
    alignSelf: 'center',
    paddingVertical: 6,
    marginBottom: 18,
  },
  link: {
    fontSize: 13,
    fontWeight: '600',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 14,
  },
});

function AppInner() {
  const { t } = useI18n();
  const { isDark } = useTheme();
  const [privacyAgreed, setPrivacyAgreed] = useState(null); // null=检查中, false=待同意, true=已同意

  useEffect(() => {
    AsyncStorage.getItem(PRIVACY_KEY)
      .then((val) => setPrivacyAgreed(val === '1'))
      .catch(() => setPrivacyAgreed(true));
  }, []);

  const handleAgree = async () => {
    await AsyncStorage.setItem(PRIVACY_KEY, '1');
    setPrivacyAgreed(true);
  };

  // 启动时检查新版本与触发自动备份（仅在用户同意隐私政策后执行）
  useEffect(() => {
    if (!privacyAgreed) return;

    checkForUpdate().then(u => {
      if (!u) return;
      Alert.alert(
        t('update.title'),
        `${t('update.current', { c: u.currentVersion })}\n${t('update.latest', { l: u.latestVersion })}\n${t('update.body')}`,
        [
          { text: t('update.later'), style: 'cancel' },
          { text: t('update.go'), onPress: () => Linking.openURL(u.downloadUrl) },
        ],
      );
    });

    runBackupIfDue().catch(() => {});
  }, [privacyAgreed, t]);

  return (
    <NavigationContainer theme={isDark ? DarkTheme : DefaultTheme}>
      <TabNavigator />
      <PrivacyModal visible={privacyAgreed === false} onAgree={handleAgree} />
    </NavigationContainer>
  );
}

// 主题根组件：状态栏 + Android 系统导航栏随主题切换；水合前不渲染避免闪色
function Root() {
  const { colors, isDark, hydrated } = useTheme();

  useEffect(() => {
    if (!hydrated) return; // 水合前不写系统导航栏，避免闪色
    if (Platform.OS === 'android') {
      try {
        NavigationBar.setBackgroundColorAsync(colors.bg);
        NavigationBar.setButtonStyleAsync(isDark ? 'light' : 'dark');
      } catch (e) { /* 忽略 */ }
    }
  }, [colors.bg, isDark, hydrated]);

  if (!hydrated) return null;

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppInner />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LanguageProvider>
          <Root />
        </LanguageProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
