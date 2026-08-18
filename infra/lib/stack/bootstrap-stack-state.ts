export type Environment = 'production' | 'staging';
export type StackState = 'fresh' | 'partial' | 'bootstrapped';

export interface StackProbe {
  /** Raw YAML text, or undefined if the file does not exist. */
  yamlText?: string;
}

/** Any of these keys in the stack yaml means a CI deploy key has been minted, so the stack counts as bootstrapped. */
const BOOTSTRAP_MARKERS = ['infra:bootstrapComplete', 'infra:vmAccessKey', 'infra:applicationId'] as const;

export function detectStackState(probe: StackProbe): StackState {
  const yamlText = probe.yamlText;
  if (yamlText == null) return 'fresh';
  return BOOTSTRAP_MARKERS.some((marker) => yamlText.includes(marker)) ? 'bootstrapped' : 'partial';
}

/** Pick the first stack short-name whose Pulumi file is present, falling back to staging for a fresh checkout. Pure: the caller supplies the existence check. */
export function pickStackShort(
  exists: (shortName: string) => boolean,
  candidates: readonly Environment[] = ['production', 'staging'],
): Environment {
  return candidates.find(exists) ?? 'staging';
}

/** Extract the plaintext `bootstrap:computeDeferred: <iso-timestamp>` marker, set before a fresh provision's first `pulumi up` (no images exist yet, so compute is not declared) and cleared once base infra is up. */
export function extractComputeDeferredMarker(yamlText: string): string | undefined {
  return yamlText.match(/^\s*bootstrap:computeDeferred:\s*(.+)$/m)?.[1]?.trim();
}

/** Detect a leftover `bootstrap:computeDeferred` marker from a fresh provision whose first `pulumi up` did not complete. While present, compute stays gated off until images are pushed. */
export function detectComputeDeferred(yamlText?: string): string | undefined {
  return yamlText ? extractComputeDeferredMarker(yamlText) : undefined;
}

/** Detect `infra:dbPublicEndpoint: "true"` in a stack config text. Callers pass the gitignored exposure overlay when present; the converge is idempotent, so a stale read only mislabels the menu. */
export function detectDbPublicEndpoint(yamlText?: string): boolean {
  return yamlText ? /(?:^|\n)\s*infra:dbPublicEndpoint:\s*["']?true/.test(yamlText) : false;
}
