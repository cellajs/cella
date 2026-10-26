/**
 * Whether an environment variable carries a secret, by the naming conventions every deploy secret follows (`SCW_`/`PULUMI_`/`AWS_` prefixes and
 * SECRET/PASSWORD/TOKEN/KEY tokens), so a newly named secret is recognised with no edit here. The deploy's telemetry redacts their values.
 */
const SECRET_KEY_PATTERN = /(^SCW_|^PULUMI_|^AWS_|SECRET|PASSWORD|PASSPHRASE|TOKEN|_KEY$|_KEY_ID$)/i;

export function isSecretEnvKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}
