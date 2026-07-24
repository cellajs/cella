import { isMain } from '../lib/utils/is-main'
import { isEnvFileDeliverable } from '../lib/utils/env-file'
import { type FetchLike, resolveFetch } from '../lib/utils/fetch-like'
import { parseJsonBody } from '../lib/utils/json'
import { runtimeSecrets } from '../lib/runtime-secrets'
import { parseServiceRows } from '../lib/utils/service-rows'
import { serviceNames } from '../lib/services'
import type { ServiceName } from '../compose/compose'
import { getFlag } from './args'

const SECRET_BASE = 'https://api.scaleway.com/secret-manager/v1beta1'

/** A runtime secret to probe, in the shape the VM manifest would carry. */
export interface SecretToCheck {
  envVar: string
  secretName: string
  required: boolean
}

export interface DeliverabilityOffender {
  envVar: string
  secretName: string
  /** 'missing' (required + no version) or an env-file reason ('multiline'/'empty'). */
  reason: 'missing' | 'multiline' | 'empty'
}

export interface AssertSecretsDeliverableResult {
  ok: boolean
  checked: number
  offenders: DeliverabilityOffender[]
}

export interface AssertSecretsDeliverableOptions {
  secretKey: string
  region: string
  projectId: string
  /** Secrets to probe. Defaults to the runtime-secrets registry. */
  secrets: SecretToCheck[]
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: FetchLike
  /** Injected for tests; defaults to console.info. */
  log?: (msg: string) => void
}

/** Resolve a secret's id from its (project-unique) name. Returns null when absent. */
async function resolveSecretIdByName(
  fetchImpl: FetchLike,
  secretKey: string,
  region: string,
  projectId: string,
  name: string,
): Promise<string | null> {
  const url = `${SECRET_BASE}/regions/${region}/secrets?project_id=${projectId}&name=${encodeURIComponent(name)}&page_size=50`
  const res = await fetchImpl(url, { method: 'GET', headers: { 'X-Auth-Token': secretKey } })
  const body = await res.text()
  if (!res.ok) throw new Error(`Secret Manager list '${name}' → ${res.status}: ${body}`)
  const { secrets = [] } = parseJsonBody<{ secrets?: Array<{ id: string; name: string }> }>(body)
  return secrets.find((s) => s.name === name)?.id ?? null
}

/**
 * Read a secret's latest version value as the VM would (base64-decoded payload).
 * Returns null when the secret has no accessible version (404 / NoSuchVersion).
 */
async function readLatestSecretValue(
  fetchImpl: FetchLike,
  secretKey: string,
  region: string,
  secretId: string,
): Promise<string | null> {
  const url = `${SECRET_BASE}/regions/${region}/secrets/${secretId}/versions/latest/access`
  const res = await fetchImpl(url, { method: 'GET', headers: { 'X-Auth-Token': secretKey } })
  const body = await res.text()
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Secret Manager access '${secretId}' → ${res.status}: ${body}`)
  const { data } = parseJsonBody<{ data?: string }>(body)
  // Secret Manager returns the value base64-encoded in `data`; the VM decodes it
  // once before writing the env line, so we mirror that to probe the real value.
  return Buffer.from(data ?? '', 'base64').toString('utf-8')
}

/**
 * Probe each secret and collect the ones that cannot be delivered to a VM. Pure
 * over the injected `fetchImpl`, so it is fully unit-testable.
 */
export async function assertSecretsDeliverable(opts: AssertSecretsDeliverableOptions): Promise<AssertSecretsDeliverableResult> {
  const fetchImpl = resolveFetch(opts.fetchImpl)
  const log = opts.log ?? ((msg) => console.info(msg))
  const offenders: DeliverabilityOffender[] = []

  for (const secret of opts.secrets) {
    const secretId = await resolveSecretIdByName(fetchImpl, opts.secretKey, opts.region, opts.projectId, secret.secretName)
    const value = secretId === null ? null : await readLatestSecretValue(fetchImpl, opts.secretKey, opts.region, secretId)

    if (value === null) {
      // Absent. Only a problem for required secrets (the sync skips an absent
      // optional secret, but a missing required one fails the boot).
      if (secret.required) offenders.push({ envVar: secret.envVar, secretName: secret.secretName, reason: 'missing' })
      continue
    }

    const deliverable = isEnvFileDeliverable(value)
    if (!deliverable.ok) {
      // A present-but-multiline value breaks the sync regardless of required.
      offenders.push({ envVar: secret.envVar, secretName: secret.secretName, reason: deliverable.reason })
    }
  }

  const ok = offenders.length === 0
  if (ok) {
    log(`✓ Runtime secrets deliverable — all ${opts.secrets.length} probed secrets are single-line and present where required`)
  } else {
    log(`✗ Runtime secrets NOT deliverable — ${offenders.map((o) => `${o.envVar} (${o.reason})`).join(', ')}`)
  }
  return { ok, checked: opts.secrets.length, offenders }
}

/**
 * Build the probe list from the runtime-secrets registry, scoped to the secrets
 * that the given enabled services actually receive, so an optional secret for a
 * disabled service (e.g. ai) never produces a false failure.
 */
export function secretsForServices(enabled: readonly ServiceName[]): SecretToCheck[] {
  const enabledSet = new Set<ServiceName>(enabled)
  return runtimeSecrets
    .filter((secret) => secret.services.some((svc) => enabledSet.has(svc)))
    .map((secret) => ({ envVar: secret.envVar, secretName: secret.secretName, required: secret.required }))
}

export function serviceNamesFromServicesJson(raw: string): ServiceName[] {
  return parseServiceRows(raw, '--services-json', { required: ['service'] })
    .map((row) => row.service)
    .filter((service): service is ServiceName => (serviceNames as readonly string[]).includes(service))
}

// Standalone entry point.
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const secretKey = process.env.SCW_SECRET_KEY
  const region = getFlag(argv, '--region') ?? process.env.REGION
  const projectId = getFlag(argv, '--project-id') ?? process.env.SCW_DEFAULT_PROJECT_ID
  const servicesJson = getFlag(argv, '--services-json')
  const servicesArg = getFlag(argv, '--services')
  const enabled = (servicesJson ? serviceNamesFromServicesJson(servicesJson) : servicesArg ? servicesArg.split(',') : serviceNames)
    .map((s) => s.trim())
    .filter((s): s is ServiceName => (serviceNames as readonly string[]).includes(s))

  if (!secretKey || !region || !projectId) throw new Error('Required: SCW_SECRET_KEY, --region, --project-id')

  const secrets = secretsForServices(enabled)
  const result = await assertSecretsDeliverable({ secretKey, region, projectId, secrets })
  if (!result.ok) {
    throw new Error(
      `Undeliverable runtime secrets: ${result.offenders.map((o) => `${o.envVar} [${o.secretName}] (${o.reason})`).join(', ')}. ` +
        'A multi-line value must be base64-encoded (single line) and decoded by the consumer; a missing required secret must be ' +
        'provisioned (pulumi-derived) or seeded (operator) before the roll. See infra/README.md, "Runtime secret delivery".',
    )
  }
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}
