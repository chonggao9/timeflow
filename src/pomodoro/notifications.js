// 番茄结束通知的唯一封装：expo-notifications 只在这里 import。
// App 前台与 widget headless 任务共用（headless 可调度已验证：模块图随 index.js 加载，
// 到点弹出由系统 AlarmManager 完成，无需 JS 存活）。
// 原则：通知只是提醒通道，状态正确性从不依赖它——所有调用 try-catch 吞错。
// 用 state.notifId 精确取消，不用 cancelAll（防止误删 headless 排期的通知）。
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const CHANNEL_ID = 'pomodoro-end';
export const LANG_KEY = 'timeflow_lang';
export const FEEDBACK_KEY = 'timeflow_focus_feedback_type';

const NOTIF_STRINGS = {
  zh: {
    channelName: '番茄钟结束提醒',
    focusTitle: '收获一颗番茄',
    focusBody: '番茄钟时间到了，快来查看你的收获吧',
    restTitle: '休息结束',
    restBody: '休息好了，开始下一个番茄吧',
    pauseTitle: '番茄暂停中',
    pauseBody: '已经暂停 10 分钟了，要继续专注吗？',
  },
  en: {
    channelName: 'Pomodoro Timer Alert',
    focusTitle: 'Pomodoro Complete',
    focusBody: 'Time is up! Tap to record your focus session',
    restTitle: 'Break is over',
    restBody: 'Feeling refreshed? Start your next pomodoro',
    pauseTitle: 'Focus Paused',
    pauseBody: 'Paused for 10 minutes. Ready to jump back in?',
  },
};

function inferLang() {
  try {
    const Localization = require('expo-localization');
    const code = Localization.getLocales?.()?.[0]?.languageCode;
    return code && code.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch (e) {
    return 'zh';
  }
}

async function getLang() {
  try {
    const saved = await AsyncStorage.getItem(LANG_KEY);
    return saved === 'zh' || saved === 'en' ? saved : inferLang();
  } catch (e) {
    return inferLang();
  }
}

let handlerReady = false;

export function ensureNotificationSetup() {
  if (handlerReady) return;
  handlerReady = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    getLang().then((lang) => {
      const s = NOTIF_STRINGS[lang] || NOTIF_STRINGS.zh;
      Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: s.channelName,
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      }).catch(() => {});
    }).catch(() => {});
  } catch (e) {
    /* 静默 */
  }
}

function defaultTexts(state, lang = 'zh') {
  const s = NOTIF_STRINGS[lang] || NOTIF_STRINGS.zh;
  if (state.mode === 'focus') {
    return { title: s.focusTitle, body: s.focusBody };
  }
  return { title: s.restTitle, body: s.restBody };
}

async function isSoundEnabled() {
  try {
    const feedback = await AsyncStorage.getItem(FEEDBACK_KEY);
    return feedback !== 'silent' && feedback !== 'vibrate';
  } catch (e) {
    return true;
  }
}

// 排期 endAt 时刻的结束通知，返回通知 id（失败返回 null）。
export async function scheduleEndNotification(state, texts) {
  try {
    ensureNotificationSetup();
    if (!state.running || !state.endAt || state.endAt <= Date.now()) return null;
    let resolvedTexts = texts;
    if (!resolvedTexts) {
      const lang = await getLang();
      resolvedTexts = defaultTexts(state, lang);
    }
    const hasSound = await isSoundEnabled();
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: resolvedTexts.title,
        body: resolvedTexts.body,
        sound: hasSound ? 'default' : false,
      },
      trigger: { type: 'date', date: new Date(state.endAt), channelId: CHANNEL_ID },
    });
  } catch (e) {
    return null;
  }
}

async function cancelById(id) {
  try {
    if (id) await Notifications.cancelScheduledNotificationAsync(id);
  } catch (e) {
    /* 静默 */
  }
}

export async function cancelEndNotification(state) {
  await cancelById(state && state.notifId);
}

// 对账：running 且 endAt 在未来 → 确保有排期（notifId 缺失则补排，兜住 headless 排期失败/OEM 清理）；
// 非 running → 取消残留排期。返回带最新 notifId 的 state（调用方负责落盘）。
// prev = 变换前的旧 state：engine 的 pause/reset/switchMode 会把 notifId 清成 null，
// 取消残留排期必须用旧 state 上的 id（否则暂停/切模式后旧结束通知仍会在 endAt 弹出）。
export async function syncNotifications(state, texts, prev = null) {
  const staleId = prev && prev.notifId && prev.notifId !== state.notifId ? prev.notifId : null;
  if (staleId) await cancelById(staleId);
  if (state.running && state.endAt && state.endAt > Date.now()) {
    if (state.notifId) return state;
    const notifId = await scheduleEndNotification(state, texts);
    return notifId ? { ...state, notifId } : state;
  }
  if (state.notifId) {
    await cancelById(state.notifId);
    return { ...state, notifId: null };
  }
  return state;
}

export async function schedulePauseReminder(minutes = 10, customTexts) {
  try {
    ensureNotificationSetup();
    let resolvedTexts = customTexts;
    if (!resolvedTexts) {
      const lang = await getLang();
      const s = NOTIF_STRINGS[lang] || NOTIF_STRINGS.zh;
      resolvedTexts = { title: s.pauseTitle, body: s.pauseBody };
    }
    const triggerDate = new Date(Date.now() + Math.max(1, minutes) * 60 * 1000);
    const hasSound = await isSoundEnabled();
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: resolvedTexts.title,
        body: resolvedTexts.body,
        sound: hasSound ? 'default' : false,
      },
      trigger: { type: 'date', date: triggerDate, channelId: CHANNEL_ID },
    });
  } catch (e) {
    return null;
  }
}

export async function cancelPauseReminder(notifId) {
  await cancelById(notifId);
}

