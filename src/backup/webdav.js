import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import WebDavTarget, { BackupError } from './targets/WebDavTarget';

const CONFIG_KEY = 'timeflow_webdav';
const PASS_KEY = 'timeflow_webdav_password';

export { BackupError as WebDavError };

export async function getWebDavConfig() {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export async function saveWebDavConfig({ url, username, appPassword }) {
  const config = { url: url.trim(), username: username.trim() };
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  if (appPassword) {
    await SecureStore.setItemAsync(PASS_KEY, appPassword);
  }
  return config;
}

export async function clearWebDavConfig() {
  await AsyncStorage.removeItem(CONFIG_KEY);
  await SecureStore.deleteItemAsync(PASS_KEY);
}

export async function getWebDavPassword() {
  try {
    return await SecureStore.getItemAsync(PASS_KEY);
  } catch (e) {
    return null;
  }
}

/**
 * 构造并获取 WebDavTarget 实例（若未配置返回 null）
 */
export async function createWebDavTarget() {
  const config = await getWebDavConfig();
  const password = await getWebDavPassword();
  if (!config || !config.url || !config.username || !password) {
    return null;
  }
  return new WebDavTarget({
    url: config.url,
    username: config.username,
    password,
  });
}

export async function testConnectionWith(url, username, appPassword) {
  try {
    const target = new WebDavTarget({
      url,
      username,
      password: appPassword,
    });
    await target.testConnection();
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
