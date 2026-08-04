/**
 * Canonical names for every IAM principal the engine creates, per app×mode.
 *
 * Principals are per-mode (`<slug>-<mode>-…`) so staging and production never
 * share an application (sharing meant a key re-mint for one environment purged
 * the other's key), and so the per-mode IAM group stays the one navigable unit
 * in Scaleway's flat org-wide console lists.
 *
 * Legacy names (`<slug>-ci-deploy`, `<slug>-vm-reader`, `<slug>-operator`)
 * predate the per-mode split; lookups fall back to them so pre-migration
 * stacks keep deploying. `pnpm infra` → "Migrate IAM model" retires them.
 */
export interface PrincipalNames {
  /** IAM group holding every application of this app×mode. */
  group: string;
  /** CI deploy application (GitHub Actions credential). */
  ciDeploy: string;
  /** VM reader application (single-app secret/registry reader; pre-P3 model). */
  vmReader: string;
  /** Human admin application (bucket access + infra reads; replaces operator). */
  admin: string;
  /** Per-service VM application (P3 model). */
  vmService: (service: string) => string;
  /** Boot fetcher application: registry pull + handoff-secret read (P3 model). */
  boot: string;
  /** Pre-per-mode names, used as lookup fallbacks only, never for creation. */
  legacy: {
    ciDeploy: string;
    vmReader: string;
    operator: string;
  };
}

/** Derive all principal names for one app×mode. */
export function principalNames(slug: string, mode: string): PrincipalNames {
  const prefix = `${slug}-${mode}`;
  return {
    group: prefix,
    ciDeploy: `${prefix}-ci-deploy`,
    vmReader: `${prefix}-vm-reader`,
    admin: `${prefix}-admin`,
    vmService: (service: string) => `${prefix}-vm-${service}`,
    boot: `${prefix}-boot`,
    legacy: {
      ciDeploy: `${slug}-ci-deploy`,
      vmReader: `${slug}-vm-reader`,
      operator: `${slug}-operator`,
    },
  };
}

/** Tags stamped on every engine-created IAM resource that supports them. */
export function principalTags(slug: string, mode: string): string[] {
  return ['managed-by=cella-infra', `app=${slug}`, `env=${mode}`];
}
