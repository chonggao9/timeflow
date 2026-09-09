const fs = require('fs');
const path = require('path');

module.exports = function withApi36Fix(config) {
  try {
    // 1. Fix expo-modules-core PermissionsService.kt
    const permPath = path.resolve(
      __dirname,
      '../node_modules/expo-modules-core/android/src/main/java/expo/modules/adapters/react/permissions/PermissionsService.kt'
    );
    if (fs.existsSync(permPath)) {
      let content = fs.readFileSync(permPath, 'utf8');
      if (content.includes('return requestedPermissions.contains(permission)')) {
        content = content.replace(
          'return requestedPermissions.contains(permission)',
          'return requestedPermissions?.contains(permission) == true'
        );
        fs.writeFileSync(permPath, content, 'utf8');
        console.log('[withApi36Fix] Successfully patched PermissionsService.kt for Android API 36');
      }
    }

    // 2. Fix react-native-screens ScreenStack.kt removeLast() collision
    const screenStackPath = path.resolve(
      __dirname,
      '../node_modules/react-native-screens/android/src/main/java/com/swmansion/rnscreens/ScreenStack.kt'
    );
    if (fs.existsSync(screenStackPath)) {
      let content = fs.readFileSync(screenStackPath, 'utf8');
      if (content.includes('drawingOpPool.removeLast()')) {
        content = content.replace(
          'drawingOpPool.removeLast()',
          'drawingOpPool.removeAt(drawingOpPool.lastIndex)'
        );
        fs.writeFileSync(screenStackPath, content, 'utf8');
        console.log('[withApi36Fix] Successfully patched ScreenStack.kt removeLast for Android 15/16');
      }
    }
  } catch (e) {
    console.warn('[withApi36Fix] Warning:', e.message);
  }
  return config;
};
