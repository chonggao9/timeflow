import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Alert, Linking } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import InsightsScreen from './src/screens/InsightsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { LanguageProvider, useI18n } from './src/i18n/LanguageContext';
import { checkForUpdate } from './src/utils/updater';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();

function TabNavigator() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
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
    <NavigationContainer>
      <TabNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <LanguageProvider>
        <AppInner />
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
