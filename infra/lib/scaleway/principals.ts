/** Canonical names for every IAM principal the engine creates, one set per app and mode. Names are per-mode so a key re-mint in one environment cannot purge the other's key. */
export interface PrincipalNames {
  /** IAM group holding every application of this app×mode. */
  group: string;
  /** CI deploy application (GitHub Actions credential). */
  ciDeploy: string;
  /** Human admin application: bucket access plus infra reads. */
  admin: string;
  /** Per-service VM application. */
  vmService: (service: string) => string;
  /** Boot fetcher application: registry pull and handoff-secret read. */
  boot: string;
}

/** Derive all principal names for one app and mode. */
export function principalNames(slug: string, mode: string): PrincipalNames {
  const prefix = `${slug}-${mode}`;
  return {
    group: prefix,
    ciDeploy: `${prefix}-ci-deploy`,
    admin: `${prefix}-admin`,
    vmService: (service: string) => `${prefix}-vm-${service}`,
    boot: `${prefix}-boot`,
  };
}

/** Tags stamped on every engine-created IAM resource that supports them. */
export function principalTags(slug: string, mode: string): string[] {
  return ['managed-by=cella-infra', `app=${slug}`, `env=${mode}`];
}
