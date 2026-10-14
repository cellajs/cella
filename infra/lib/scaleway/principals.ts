/** Set by tasks/admit-operator-buckets.ts on the one run that writes bucket policies with the retired admin application's key. */
export const ADMISSION_RUN_ENV = 'INFRA_ADMISSION_RUN';

/** Canonical names for every IAM principal the engine creates, one set per app and mode. Names are per-mode so a key re-mint in one environment cannot purge the other's key. */
export interface PrincipalNames {
  /** IAM group holding every application of this app×mode. */
  group: string;
  /** CI deploy application (the key GitHub Actions deploys with). */
  ciDeploy: string;
  /** The retired admin application: its key admits the operator to bucket policies written before it, once, in an apply (ledger L2). */
  admin: string;
  /** Operator application: the principal a person runs privileged actions as, from a dedicated IP address only. One per app, the same in every environment. */
  operator: string;
  /** Observer application: the read-only key on the person's machine, from the office only. One per app, the same in every environment. */
  observer: string;
  /** Per-service VM application. */
  vmService: (service: string) => string;
  /** Boot fetcher application: registry pull and handoff-secret read. */
  boot: string;
}

/**
 * The app's own slug, the same in every environment: a mode's slug without its `-<mode>` ending. An environment that is not production
 * conventionally carries its mode in its slug (`cella-staging` in staging), and both belong to the app `cella`.
 */
export function appSlug(slug: string, mode: string): string {
  const ending = `-${mode}`;
  return slug.endsWith(ending) && slug.length > ending.length ? slug.slice(0, -ending.length) : slug;
}

/** Derive all principal names for one app and mode. */
export function principalNames(slug: string, mode: string): PrincipalNames {
  const prefix = `${slug}-${mode}`;
  return {
    group: prefix,
    ciDeploy: `${prefix}-ci-deploy`,
    admin: `${prefix}-admin`,
    operator: `${appSlug(slug, mode)}-operator`,
    observer: `${appSlug(slug, mode)}-observer`,
    vmService: (service: string) => `${prefix}-vm-${service}`,
    boot: `${prefix}-boot`,
  };
}

/** Tags stamped on every engine-created IAM resource that supports them. */
export function principalTags(slug: string, mode: string): string[] {
  return ['managed-by=cella-infra', `app=${slug}`, `env=${mode}`];
}
