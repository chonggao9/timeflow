import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_KEY = 'timeflow_profile';

// 读取个人信息（昵称等）
export async function getProfile() {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  return raw ? JSON.parse(raw) : { nickname: '' };
}

// 保存个人信息
export async function saveProfile(profile) {
  const cur = await getProfile();
  const next = { ...cur, ...profile };
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  return next;
}
