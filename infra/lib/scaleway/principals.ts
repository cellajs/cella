/** Canonical names for the IAM principals of one environment. Names are per-mode so a key re-mint in one environment cannot purge the other's key. */
export interface PrincipalNames {
  /** IAM group holding every application of this app×mode. */
  group: string;
  /** The deploy application: the key the main job deploys with. */
  ciDeploy: string;
  /** The uploads application: its key, in the runtime folder, signs the backend's uploads and presigned URLs. */
  uploads: string;
}

/** Canonical names for the IAM principals an app has one of, the same in every environment. */
export interface AppPrincipalNames {
  /** Operator application: the principal a person runs privileged actions as, on a key that ends within a day. */
  operator: string;
  /** Operators group: the users whose own one-day keys run privileged actions, under the operator application's rules. */
  operators: string;
  /** Observer application: the read-only key on the person's machine, from any address. */
  observer: string;
}

/** Derive the principal names of one environment. */
export function principalNames(slug: string, mode: string): PrincipalNames {
  const prefix = `${slug}-${mode}`;
  return {
    group: prefix,
    ciDeploy: `${prefix}-ci-deploy`,
    uploads: `${prefix}-uploads`,
  };
}

/** Derive the principal names an app has one of, from its own slug (`appSlug` in the engine config). */
export function appPrincipalNames(appSlug: string): AppPrincipalNames {
  return { operator: `${appSlug}-operator`, operators: `${appSlug}-operators`, observer: `${appSlug}-observer` };
}

/** Every principal name one environment of the app meets: its own, and the app's. */
export function allPrincipalNames(config: { slug: string; appSlug: string }, mode: string): PrincipalNames & AppPrincipalNames {
  return { ...principalNames(config.slug, mode), ...appPrincipalNames(config.appSlug) };
}

/** Tags stamped on every engine-created IAM resource that supports them. */
export function principalTags(slug: string, mode: string): string[] {
  return ['managed-by=cella-infra', `app=${slug}`, `env=${mode}`];
}
