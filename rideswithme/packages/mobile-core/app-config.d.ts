export declare function releaseSettings(env?: Record<string, string | undefined>): {
  owner?: string;
  extra?: { eas: { projectId: string } };
  googleServicesFile?: string;
};
