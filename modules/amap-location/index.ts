// 高德定位（Expo 原生模块）：一次性取当前坐标，用于无 GMS 机型兜底。
// 用 requireOptionalNativeModule：原生模块未链接（如 Expo Go）时返回 null，不抛错。
import { requireOptionalNativeModule } from 'expo-modules-core';

export default requireOptionalNativeModule('AmapLocation');
