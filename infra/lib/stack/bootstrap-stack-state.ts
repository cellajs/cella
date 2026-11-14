export type Environment = 'production' | 'staging';
export type StackState = 'fresh' | 'partial' | 'bootstrapped';

export interface StackProbe {
  /** Raw YAML text, or undefined if the file does not exist. */
  yamlText?: string;
}

/** The key a setup writes to the stack yaml once the deploy key is made: with it the stack counts as bootstrapped. */
const bootstrapMarker = 'infra:bootstrapComplete';

export function detectStackState(probe: StackProbe): StackState {
  const yamlText = probe.yamlText;
  if (yamlText == null) return 'fresh';
  return yamlText.includes(bootstrapMarker) ? 'bootstrapped' : 'partial';
}

/** Pick the first stack short-name whose Pulumi file is present, falling back to production for a fresh checkout. Pure: the caller supplies the existence check. */
export function pickStackShort(exists: (shortName: string) => boolean, candidates: readonly Environment[] = ['production', 'staging']): Environment {
  return candidates.find(exists) ?? 'production';
}

/** Extract the plaintext `bootstrap:computeDeferred: <iso-timestamp>` marker, set before a fresh provision's first `pulumi up` and cleared once the foundation is up. */
export function extractComputeDeferredMarker(yamlText: string): string | undefined {
  return yamlText.match(/^\s*bootstrap:computeDeferred:\s*(.+)$/m)?.[1]?.trim();
}

/** Detect a leftover `bootstrap:computeDeferred` marker from a fresh provision whose first `pulumi up` did not complete. */
export function detectComputeDeferred(yamlText?: string): string | undefined {
  return yamlText ? extractComputeDeferredMarker(yamlText) : undefined;
}

/**
 * Whether a stack is in its first provisioning: never provisioned, or a resume of a first provisioning that did not finish, which still
 * carries the compute-deferred marker. The one reading of it, so the steps that care cannot disagree.
 */
export function inFirstProvisioning(stack: { state: StackState; stackYaml?: string }): boolean {
  return stack.state === 'fresh' || Boolean(detectComputeDeferred(stack.stackYaml));
}

/** Detect `infra:dbPublicEndpoint: "true"` in a stack config text. Callers pass the gitignored exposure overlay when present; the converge is idempotent, so a stale read only mislabels the menu. */
export function detectDbPublicEndpoint(yamlText?: string): boolean {
  return yamlText ? /(?:^|\n)\s*infra:dbPublicEndpoint:\s*["']?true/.test(yamlText) : false;
}
