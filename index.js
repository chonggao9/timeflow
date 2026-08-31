// App 入口：同时注册根组件 + 桌面小组件 task handler。
// react-native-android-widget 要求 main 指向自定义入口（而非 expo/AppEntry.js），
// 让 widget 的 headless JS 在进程被杀/后台时也能被 Android 拉起执行。
// 注入 global.crypto.getRandomValues，供 crypto-js（备份 AES 随机盐/IV）在 Hermes 下拿强随机。
import 'react-native-get-random-values';

import { registerRootComponent } from 'expo';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import App from './App';
import { widgetTaskHandler } from './widget/widgetTaskHandler';

registerRootComponent(App);
registerWidgetTaskHandler(widgetTaskHandler);
