/**
 * Pure-function linter: walks a Pulumi.<stack>.yaml config block and reports
 * any key that looks like a secret but isn't stored as a Pulumi-encrypted value
 * (`{ secure: '<ciphertext>' }`).
 *
 * Used by tests + can be invoked as a pre-commit hook. No fs, no Pulumi
 * runtime — just string parsing so it works on any backend.
 */

/** Explicit list of config keys that MUST be encrypted in stack YAML. */
export const KNOWN_SECRET_KEYS: readonly string[] = [
  'scaleway:accessKey',
  'scaleway:secretKey',
  'infra:dbPassword',
  'infra:cookieSecret',
  'infra:unsubscribeSecret',
  'infra:cdcSecret',
  'infra:yjsSecret',
  'infra:piiHashSecret',
  'infra:adminEmail',
  'infra:brevoApiKey',
  'infra:scwAiApiKey',
  'infra:adminPassword',
  'infra:runtimePassword',
  'infra:cdcPassword',
]

/** Suffix patterns that always imply a secret value, regardless of namespace. */
const SECRET_SUFFIX_PATTERN = /(secret|password|token|apikey|api_key|key)$/i

/** Keys that match a suffix but are deliberately non-secret. */
const SUFFIX_ALLOWLIST = new Set<string>([
  'scaleway:projectId',
  'scaleway:organizationId',
  'scaleway:region',
  'scaleway:zone',
  'infra:backendImageTag',
  'infra:cdcImageTag',
  'infra:yjsImageTag',
  'infra:aiWorkerImageTag',
])

export interface SecretViolation {
  key: string
  reason: 'plaintext' | 'malformed-secure'
}

/**
 * Returns a violation for every config key that should be `secure:`-encrypted
 * but isn't. Empty array = clean.
 */
export function findUnencryptedSecrets(yamlText: string): SecretViolation[] {
  // Slice out the `config:` block. We don't pull in a YAML lib to keep this
  // dependency-free; structure of Pulumi stack files is fully line-oriented.
  const configIdx = yamlText.indexOf('\nconfig:')
  const configBlock = configIdx === -1 ? yamlText : yamlText.slice(configIdx)

  const violations: SecretViolation[] = []
  const lines = configBlock.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Match a top-level config key: 2-space indent + `<ns>:<name>:` (with optional trailing value or nothing)
    const m = line.match(/^ {2}([\w-]+:[\w-]+):\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    const inlineValue = m[2]

    const looksLikeSecret = KNOWN_SECRET_KEYS.includes(key) || (SECRET_SUFFIX_PATTERN.test(key) && !SUFFIX_ALLOWLIST.has(key))
    if (!looksLikeSecret) continue

    if (inlineValue.length > 0) {
      // Bare scalar after the key — definitely not encrypted.
      violations.push({ key, reason: 'plaintext' })
      continue
    }
    // Multi-line: next non-empty indented line must be `    secure: <ciphertext>`.
    const next = lines[i + 1] ?? ''
    if (!/^ {4}secure:\s*\S+/.test(next)) {
      violations.push({ key, reason: 'malformed-secure' })
    }
  }

  return violations
}
