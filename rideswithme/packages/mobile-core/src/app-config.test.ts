import { describe, expect, it } from 'vitest';
import { releaseSettings } from '../app-config';

const store = {
  EXPO_PUBLIC_API_URL: 'https://api.example.ng',
  EXPO_PUBLIC_POLICY_VERSION: '2026-11',
  EAS_PROJECT_ID: '1b2c3d4e-0000-4000-8000-000000000000',
};

describe('releaseSettings', () => {
  it('passes the EAS project, owner and Firebase file through', () => {
    expect(
      releaseSettings({
        ...store,
        EAS_BUILD_PROFILE: 'production',
        EXPO_OWNER: 'rideswithme',
        GOOGLE_SERVICES_JSON: '/tmp/google-services.json',
      }),
    ).toEqual({
      owner: 'rideswithme',
      extra: { eas: { projectId: store.EAS_PROJECT_ID } },
      googleServicesFile: '/tmp/google-services.json',
    });
  });

  it('refuses a store build that would talk to a development API or lack push', () => {
    expect(() =>
      releaseSettings({
        EAS_BUILD_PROFILE: 'production',
        EXPO_PUBLIC_API_URL: 'http://10.0.2.2:3000',
      }),
    ).toThrow(/https:\/\/.*\n- EAS_PROJECT_ID is not set\n- EXPO_PUBLIC_POLICY_VERSION/);
    expect(() =>
      releaseSettings({ ...store, EAS_BUILD_PROFILE: 'preview', EAS_PROJECT_ID: '' }),
    ).toThrow(/EAS_PROJECT_ID/);
  });

  it('asks nothing of local and development builds', () => {
    expect(releaseSettings({})).toEqual({});
    expect(releaseSettings({ EAS_BUILD_PROFILE: 'development' })).toEqual({});
  });
});
