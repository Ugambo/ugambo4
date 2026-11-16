// @ts-check
/**
 * Store-build settings shared by the passenger and driver apps' app.config.ts.
 * Plain JavaScript because Expo loads it while reading the app config, before
 * anything is built. See documentation/LAUNCH.md ("Store builds").
 *
 * EAS Build runs the config with EAS_BUILD_PROFILE set and, through the
 * profile's "environment", with that EAS environment's variables:
 *   EXPO_PUBLIC_API_URL    API the app talks to (https:// for store builds)
 *   EAS_PROJECT_ID         the app's EAS project (needed for push notifications)
 *   EXPO_OWNER             the Expo account or organisation that owns the project
 *   GOOGLE_SERVICES_JSON   Firebase config file for Android push (an EAS "file" variable)
 *   SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT
 *                          optional: upload source maps to Sentry during the build, so
 *                          crash reports show the original code (EAS secret for the token)
 */

const STORE_PROFILES = new Set(['preview', 'production']);

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ owner?: string; extra?: { eas: { projectId: string } }; googleServicesFile?: string }}
 */
function releaseSettings(env = process.env) {
  const profile = env.EAS_BUILD_PROFILE;
  if (profile && STORE_PROFILES.has(profile)) {
    const problems = [];
    const api = env.EXPO_PUBLIC_API_URL ?? '';
    if (!api.startsWith('https://'))
      problems.push(`EXPO_PUBLIC_API_URL must be an https:// address (got "${api}")`);
    if (!env.EAS_PROJECT_ID) problems.push('EAS_PROJECT_ID is not set');
    if (!env.EXPO_PUBLIC_POLICY_VERSION) problems.push('EXPO_PUBLIC_POLICY_VERSION is not set');
    if (problems.length)
      throw new Error(
        `Cannot make a "${profile}" build:\n- ${problems.join('\n- ')}\n` +
          `Set these in the EAS "${profile}" environment (expo.dev → project → Environment variables).`,
      );
  }
  return {
    ...(env.EXPO_OWNER && { owner: env.EXPO_OWNER }),
    ...(env.EAS_PROJECT_ID && { extra: { eas: { projectId: env.EAS_PROJECT_ID } } }),
    ...(env.GOOGLE_SERVICES_JSON && { googleServicesFile: env.GOOGLE_SERVICES_JSON }),
  };
}

/**
 * The Sentry config plugin (source map upload during the build), only when
 * the build has Sentry credentials; without them builds are unchanged.
 * @param {Record<string, string | undefined>} env
 * @returns {[string, { organization: string; project: string; url?: string }][]}
 */
function sentryPlugins(env = process.env) {
  if (!env.SENTRY_AUTH_TOKEN || !env.SENTRY_ORG || !env.SENTRY_PROJECT) return [];
  return [
    [
      '@sentry/react-native',
      {
        organization: env.SENTRY_ORG,
        project: env.SENTRY_PROJECT,
        ...(env.SENTRY_URL && { url: env.SENTRY_URL }),
      },
    ],
  ];
}

module.exports = { releaseSettings, sentryPlugins };
