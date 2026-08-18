/**
 * Remove credential-bearing variables from an environment map.
 *
 * The deploy job holds Scaleway keys, the Pulumi passphrase, and a GitHub token
 * in its process environment (injected as job env in deploy-pipeline.yml). Those
 * must never reach the frontend build, whose Vite plugin graph is a broad
 * third-party-code execution surface that runs at build time. Matching removes
 * keys by the naming conventions every deploy secret follows (`SCW_`/`PULUMI_`/
 * `AWS_` prefixes and SECRET/PASSWORD/TOKEN/KEY tokens), so a newly named secret
 * is scrubbed with no edit here while build essentials like PATH and HOME stay.
 */
const SECRET_KEY_PATTERN = /(^SCW_|^PULUMI_|^AWS_|SECRET|PASSWORD|PASSPHRASE|TOKEN|_KEY$|_KEY_ID$)/i;

export function isSecretEnvKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

export function scrubSecretEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !isSecretEnvKey(key)) out[key] = value;
  }
  return out;
}
