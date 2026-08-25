import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Alert, Linking } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import InsightsScreen from './src/screens/InsightsScreen';
import { checkForUpdate } from './src/utils/updater';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();

function TabNavigator() {
  const insets = useSafeAreaInsets();
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
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: '打卡',
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'time' : 'time-outline'} size={24} color={focused ? colors.primary : colors.ink3} />
          ),
        }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsScreen}
        options={{
          tabBarLabel: '洞察',
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'stats-chart' : 'stats-chart-outline'} size={24} color={focused ? colors.primary : colors.ink3} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  // 启动时检查新版本，有则弹窗引导下载
  useEffect(() => {
    checkForUpdate().then(u => {
      if (!u) return;
      Alert.alert(
        '发现新版本',
        `当前版本 ${u.currentVersion}\n最新版本 ${u.latestVersion}\n建议更新以获得最新体验。`,
        [
          { text: '稍后', style: 'cancel' },
          { text: '去更新', onPress: () => Linking.openURL(u.downloadUrl) },
        ],
      );
    });
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        <TabNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
