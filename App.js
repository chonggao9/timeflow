import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './src/screens/HomeScreen';
import InsightsScreen from './src/screens/InsightsScreen';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.ink3,
            tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          }}
        >
          <Tab.Screen
            name="Home"
            component={HomeScreen}
            options={{
              tabBarLabel: '打卡',
              tabBarIcon: ({ focused }) => (
                <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>⏱</Text>
              ),
            }}
          />
          <Tab.Screen
            name="Insights"
            component={InsightsScreen}
            options={{
              tabBarLabel: '洞察',
              tabBarIcon: ({ focused }) => (
                <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>📊</Text>
              ),
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
