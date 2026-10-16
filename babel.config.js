module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'babel-plugin-react-compiler',
        {
          sources: (filename) => {
            return Boolean(
              filename &&
              filename.includes('src') &&
              !filename.includes('node_modules') &&
              !filename.includes('widget')
            );
          },
        },
      ],
      ['react-native-reanimated/plugin'],
    ],
  };
};
