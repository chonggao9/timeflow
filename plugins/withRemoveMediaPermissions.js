const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withRemoveMediaPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    const removePerms = [
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      'android.permission.READ_EXTERNAL_STORAGE',
    ];

    removePerms.forEach((perm) => {
      const existing = manifest['uses-permission'].find(
        (p) => p.$ && p.$['android:name'] === perm
      );
      if (existing) {
        existing.$['tools:node'] = 'remove';
      } else {
        manifest['uses-permission'].push({
          $: {
            'android:name': perm,
            'tools:node': 'remove',
          },
        });
      }
    });

    return cfg;
  });
};
