const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Performance optimizations
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// Enable tree shaking
config.transformer.minifierConfig = {
  keep_fnames: true,
  mangle: {
    keep_fnames: true,
  },
};

// Optimize bundle splitting
config.serializer.createModuleIdFactory = function () {
  return function (path) {
    // Use relative paths for better caching
    return path.replace(__dirname, '').replace(/\\/g, '/');
  };
};

// Reduce bundle size
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

module.exports = config;
