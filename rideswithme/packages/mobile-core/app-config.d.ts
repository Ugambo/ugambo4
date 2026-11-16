export declare function releaseSettings(env?: Record<string, string | undefined>): {
  owner?: string;
  extra?: { eas: { projectId: string } };
  googleServicesFile?: string;
};
export declare function sentryPlugins(
  env?: Record<string, string | undefined>,
): [string, { organization: string; project: string; url?: string }][];
