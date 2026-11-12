// Metro configuration shared by the Expo apps in this monorepo.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

/**
 * Bare imports made by workspace packages (packages/*) are resolved as if the
 * app made them, so React, React Native and every Expo module exist exactly
 * once in the bundle. Without this, a package's own development copy of React
 * could be bundled too, and two copies of React break hooks. Imports the app
 * does not depend on (e.g. zod inside @rideswithme/validation) resolve normally.
 */
function createConfig(appDir) {
  const config = getDefaultConfig(appDir);
  const packagesDir = path.resolve(__dirname, 'packages') + path.sep;
  const appOrigin = path.join(appDir, 'package.json');
  const upstream = config.resolver.resolveRequest;
  const resolve = (context, moduleName, platform) =>
    upstream
      ? upstream(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);

  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const fromPackage = context.originModulePath.startsWith(packagesDir);
    const bare = !moduleName.startsWith('.') && !path.isAbsolute(moduleName);
    if (fromPackage && bare) {
      try {
        return resolve({ ...context, originModulePath: appOrigin }, moduleName, platform);
      } catch {
        // Not one of the app's dependencies: fall through to normal resolution.
      }
    }
    return resolve(context, moduleName, platform);
  };
  return config;
}

module.exports = { createConfig };
