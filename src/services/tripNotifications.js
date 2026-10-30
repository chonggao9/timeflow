// 行程 80 分钟超时预警通知：在行程活跃时排期，在有新打卡时顺延，在结束行程时取消。
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TRIP_REMINDER_ID_KEY = 'timeflow_trip_reminder_notification_id';
export const TRIP_REMINDER_CHANNEL_ID = 'trip-reminder-silent';
export const REMINDER_DELAY_SEC = 80 * 60; // 80 分钟

let channelReady = false;
async function ensureChannel() {
  if (channelReady || Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(TRIP_REMINDER_CHANNEL_ID, {
      name: '行程提醒',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
      enableVibrate: false,
    });
    channelReady = true;
  } catch (e) {
    // 静默忽略渠道设置异常
  }
}

/**
 * 排期行程超时提醒
 * @param {string} [title]
 * @param {string} [body]
 * @param {number} [delaySec]
 * @returns {Promise<string | null>}
 */
export async function scheduleTripReminder(title, body, delaySec = REMINDER_DELAY_SEC) {
  try {
    // 1. 检查通知权限，未授权时静默跳过
    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted && !permissions.ios?.status) {
      return null;
    }

    // 2. 确保 Android 静音低优先级渠道已注册
    await ensureChannel();

    // 3. 取消现有的旧提醒
    await cancelTripReminder();

    // 4. 排期提醒通知
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: title || '行程还在进行中',
        body: body || '如果已到达目的地，别忘了打卡或结束行程',
        sound: null,
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(delaySec)),
        repeats: false,
        channelId: TRIP_REMINDER_CHANNEL_ID,
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
