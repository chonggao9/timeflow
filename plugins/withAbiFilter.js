// 自定义 config plugin：把 reactNativeArchitectures 限定为真机架构，去掉模拟器用的 x86/x86_64。
// expo-build-properties@0.12.5 (SDK51) 不支持 buildArchs，故用 withGradleProperties 直接改。
const { withGradleProperties } = require('@expo/config-plugins');

const KEY = 'reactNativeArchitectures';
const ARCHS = 'armeabi-v7a,arm64-v8a';

module.exports = function withAbiFilter(config) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter(
      (item) => !(item.type === 'property' && item.key === KEY)
    );
    cfg.modResults.push({ type: 'property', key: KEY, value: ARCHS });
    return cfg;
  });
};
