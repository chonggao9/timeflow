// 行程 80 分钟超时预警通知：在行程活跃时排期，在有新打卡时顺延，在结束行程时取消。
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TRIP_REMINDER_ID_KEY = 'timeflow_trip_reminder_notification_id';
const REMINDER_DELAY_SEC = 80 * 60; // 80 分钟

export async function scheduleTripReminder(title, body) {
  try {
    // 1. 取消现有的提醒
    await cancelTripReminder();

    // 2. 排期 80 分钟后的提醒
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: title || '行程还在进行中',
        body: body || '如果已到达目的地，别忘了打卡或结束行程',
        sound: false,
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: REMINDER_DELAY_SEC,
        repeats: false,
      },
    });

    if (id) {
      await AsyncStorage.setItem(TRIP_REMINDER_ID_KEY, id);
    }
    return id;
  } catch (e) {
    // 静默失败，不阻塞主流程
    return null;
  }
}

export async function cancelTripReminder() {
  try {
    const existingId = await AsyncStorage.getItem(TRIP_REMINDER_ID_KEY);
    if (existingId) {
      await Notifications.cancelScheduledNotificationAsync(existingId);
      await AsyncStorage.removeItem(TRIP_REMINDER_ID_KEY);
    }
  } catch (e) {
    // 静默失败
  }
}
