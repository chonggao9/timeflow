import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Alert, Linking, Platform, View, Text, Modal, TouchableOpacity, StyleSheet, BackHandler, ScrollView } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as NavigationBar from 'expo-navigation-bar';
import HomeScreen from './src/screens/HomeScreen';
import InsightsScreen from './src/screens/InsightsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import PrivacyAgreement from './src/screens/PrivacyAgreement';
import { LanguageProvider, useI18n } from './src/i18n/LanguageContext';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { checkForUpdate } from './src/utils/updater';
import { initBackupSchedule } from './src/backup/schedule';
import { runV2CleanupOnce } from './src/backup/cleanup';

const Tab = createBottomTabNavigator();

function TabNavigator() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.primaryStrong,
        tabBarInactiveTintColor: colors.ink2,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600', marginTop: -3 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 58 + insets.bottom,
          paddingTop: 0,
          paddingBottom: insets.bottom,
          elevation: 4,
          shadowColor: colors.ink,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.04,
          shadowRadius: 6,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
          paddingVertical: 0,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: t('tab.checkin'),
          tabBarAccessibilityLabel: t('tab.checkin'),
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'time' : 'time-outline'} size={25} color={focused ? colors.primaryStrong : colors.ink2} />
          ),
        }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsScreen}
        options={{
          tabBarLabel: t('tab.insights'),
          tabBarAccessibilityLabel: t('tab.insights'),
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'stats-chart' : 'stats-chart-outline'} size={25} color={focused ? colors.primaryStrong : colors.ink2} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: t('tab.profile'),
          tabBarAccessibilityLabel: t('tab.profile'),
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={25} color={focused ? colors.primaryStrong : colors.ink2} />
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
                '3. 自主备份：备份文件是明文 JSON，只保存在本机；若开启云端副本，将传输至您自有的 WebDAV 空间，请使用只有您自己能访问的账号。'
              : 'Welcome to TimeFlow! Please read and understand our terms before use:\n\n' +
                '1. Data Minimization: Coordinates and time are read ONLY when you explicitly check in. Data stays on your local device.\n' +
                '2. Third-Party SDK: Integrated with Amap Location SDK to provide accurate location during check-in.\n' +
                '3. Self-hosted Backup: Backup files are plain JSON stored on this device. If cloud copy is enabled, they are uploaded to your own WebDAV space — please use an account only you can access.'}
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
  const { isDark, colors } = useTheme();
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

    // 旧备份体系一次性清理（删旧备份目录与旧配置键，不动用户数据），完成后再启动新调度
    runV2CleanupOnce()
      .catch(() => {})
      .then(() => { initBackupSchedule(); });
  }, [privacyAgreed, t]);

  const navTheme = React.useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.bg,
        card: colors.surface,
        text: colors.ink,
        border: colors.line,
        primary: colors.primary,
      },
    };
  }, [isDark, colors]);

  return (
    <NavigationContainer theme={navTheme}>
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
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.bg} />
      <AppInner />
    </View>
  );
}

// 错误边界组件：拦截未捕获的渲染异常，杜绝全屏空白
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught error]', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleCopy = async () => {
    try {
      const err = this.state.error;
      const text = `Error: ${err?.name || 'Error'}: ${err?.message || 'unknown'}\n\nStack:\n${err?.stack || 'no stack'}\n\nComponentStack:\n${this.state.errorInfo?.componentStack || 'none'}`;
      await Clipboard.setStringAsync(text);
      Alert.alert('已复制', '异常详细信息已复制到剪贴板');
    } catch (e) {}
  };

  render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || '组件渲染发生未知错误';
      const stack = this.state.error?.stack || '';
      return (
        <View style={errStyles.container}>
          <Ionicons name="alert-circle" size={54} color="#FF6B6B" style={errStyles.icon} />
          <Text style={errStyles.title}>界面加载异常</Text>
          <Text style={errStyles.msg}>{errorMsg}</Text>
          {!!stack && (
            <ScrollView style={errStyles.stackBox} contentContainerStyle={errStyles.stackBoxContent}>
              <Text style={errStyles.stackText}>{stack}</Text>
            </ScrollView>
          )}
          <View style={errStyles.btnRow}>
            <TouchableOpacity
              style={[errStyles.btn, errStyles.btnSecondary]}
              onPress={this.handleCopy}
              activeOpacity={0.8}
            >
              <Text style={errStyles.btnSecondaryText}>复制错误信息</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={errStyles.btn}
              onPress={() => this.setState({ hasError: false, error: null, errorInfo: null })}
              activeOpacity={0.8}
            >
              <Text style={errStyles.btnText}>重新加载</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

const errStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FAF7F4',
  },
  icon: {
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1917',
    marginBottom: 8,
  },
  msg: {
    fontSize: 14,
    color: '#D33A3A',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
    fontWeight: '600',
  },
  stackBox: {
    maxHeight: 140,
    width: '100%',
    backgroundColor: '#F3EFEA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E6E0D8',
    marginBottom: 20,
  },
  stackBoxContent: {
    padding: 10,
  },
  stackText: {
    fontSize: 11,
    color: '#78716C',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondary: {
    backgroundColor: '#EBE5DE',
  },
  btnSecondaryText: {
    color: '#44403C',
    fontWeight: '600',
    fontSize: 14,
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <ThemeProvider>
            <LanguageProvider>
              <Root />
            </LanguageProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
