const fs = require('fs');
const path = require('path');

module.exports = function withApi36Fix(config) {
  try {
    const filePath = path.resolve(
      __dirname,
      '../node_modules/expo-modules-core/android/src/main/java/expo/modules/adapters/react/permissions/PermissionsService.kt'
    );
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('return requestedPermissions.contains(permission)')) {
        content = content.replace(
          'return requestedPermissions.contains(permission)',
          'return requestedPermissions?.contains(permission) == true'
        );
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('[withApi36Fix] Successfully patched PermissionsService.kt for Android API 36');
      }
    }
  } catch (e) {
    console.warn('[withApi36Fix] Warning:', e.message);
  }
  return config;
};
