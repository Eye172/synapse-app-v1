const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// zustand's ESM build reads `import.meta`, which breaks when Metro serves the
// bundle as a classic script (web). Resolve zustand through its CommonJS
// entries instead — identical behavior, no import.meta.
const path = require('path');

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  if (moduleName === 'zustand' || moduleName.startsWith('zustand/')) {
    return resolve(
      { ...context, unstable_conditionNames: ['require', 'react-native', 'default'] },
      moduleName,
      platform,
    );
  }
  // The Anthropic SDK's ESM entry imports node:* modules for server-side
  // credential-profile resolution — code that never runs on the device (we
  // always construct the client with an explicit key). Metro can't resolve
  // node builtins on native, so map them to an empty module there.
  if (platform !== 'web' && moduleName.startsWith('node:')) {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'src/shims/empty.js'),
    };
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
