/** Env marker the infra CLI's privileged converge sets on its `pulumi up` child. Absent on CI ups, which run with the read-only CI key. */
export const PRIVILEGED_UP_ENV = 'INFRA_PRIVILEGED_UP';

/** Whether the running Pulumi program holds a bootstrap key that may write IAM. */
export function isPrivilegedUp(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[PRIVILEGED_UP_ENV] === '1';
}

/**
 * `ignoreChanges` for the VM IAM policies. A CI up must never diff `rules`: the write would 403 under the CI key, and the provider's condition empty-vs-unset asymmetry shows a phantom `~rules` anyway.
 * A privileged up reconciles `rules`, so a changed secret scope (a co-hosted or collocated service toggled on or off) reaches the live policy before the deploy's assert-vm-grants step compares conditions.
 */
export function vmPolicyIgnoreChanges(env: NodeJS.ProcessEnv = process.env): string[] {
  return isPrivilegedUp(env) ? ['description'] : ['rules', 'description'];
}
