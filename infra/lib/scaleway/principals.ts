/** Set by tasks/admit-operator-buckets.ts on the one run that writes bucket policies with the retired admin application's key. */
export const ADMISSION_RUN_ENV = 'INFRA_ADMISSION_RUN';

/** Canonical names for the IAM principals of one environment. Names are per-mode so a key re-mint in one environment cannot purge the other's key. */
export interface PrincipalNames {
  /** IAM group holding every application of this app×mode. */
  group: string;
  /** The deploy application: the key the main job deploys with. */
  ciDeploy: string;
  /** The retired admin application: its key admits the operator to bucket policies written before it, once, in an apply (ledger L2). */
  admin: string;
  /** Per-service VM application. */
  vmService: (service: string) => string;
  /** Boot fetcher application: registry pull and handoff-secret read. */
  boot: string;
  /** Builder application: pushes a release's images and writes its frontend files, on a builder machine the deploy makes. */
  builder: string;
}

/** Canonical names for the IAM principals an app has one of, the same in every environment. */
export interface AppPrincipalNames {
  /** Operator application: the principal a person runs privileged actions as, from a dedicated IP address only. */
  operator: string;
  /** Observer application: the read-only key on the person's machine, from the office only. */
  observer: string;
}

/** Derive the principal names of one environment. */
export function principalNames(slug: string, mode: string): PrincipalNames {
  const prefix = `${slug}-${mode}`;
  return {
    group: prefix,
    ciDeploy: `${prefix}-ci-deploy`,
    admin: `${prefix}-admin`,
    vmService: (service: string) => `${prefix}-vm-${service}`,
    boot: `${prefix}-boot`,
    builder: `${prefix}-builder`,
  };
}

/** Derive the principal names an app has one of, from its own slug (`appSlug` in the engine config). */
export function appPrincipalNames(appSlug: string): AppPrincipalNames {
  return { operator: `${appSlug}-operator`, observer: `${appSlug}-observer` };
}

/** Every principal name one environment of the app meets: its own, and the app's. */
export function allPrincipalNames(config: { slug: string; appSlug: string }, mode: string): PrincipalNames & AppPrincipalNames {
  return { ...principalNames(config.slug, mode), ...appPrincipalNames(config.appSlug) };
}

/** Tags stamped on every engine-created IAM resource that supports them. */
export function principalTags(slug: string, mode: string): string[] {
  return ['managed-by=cella-infra', `app=${slug}`, `env=${mode}`];
}
