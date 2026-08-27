import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Alert, Linking, Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import HomeScreen from './src/screens/HomeScreen';
import InsightsScreen from './src/screens/InsightsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { LanguageProvider, useI18n } from './src/i18n/LanguageContext';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { checkForUpdate } from './src/utils/updater';

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
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
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

function AppInner() {
  const { t } = useI18n();
  const { isDark } = useTheme();

  // 启动时检查新版本，有则弹窗引导下载
  useEffect(() => {
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
  }, [t]);

  return (
    <NavigationContainer theme={isDark ? DarkTheme : DefaultTheme}>
      <TabNavigator />
    </NavigationContainer>
  );
}

// 主题根组件：状态栏 + Android 系统导航栏随主题切换；水合前不渲染避免闪色
function Root() {
  const { colors, isDark, hydrated } = useTheme();

  useEffect(() => {
    if (Platform.OS === 'android') {
      try {
        NavigationBar.setBackgroundColorAsync(colors.bg);
        NavigationBar.setButtonStyleAsync(isDark ? 'light' : 'dark');
      } catch (e) { /* 忽略 */ }
    }
  }, [colors.bg, isDark]);

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
