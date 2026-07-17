import * as pulumi from '@pulumi/pulumi'

/** True when every resolver's answer set contains the expected IP. */
export function dnsAnswersSatisfy(answersPerResolver: string[][], expectedIp: string): boolean {
  return answersPerResolver.length > 0 && answersPerResolver.every((answers) => answers.includes(expectedIp))
}

/** Certificate poll verdict: proceed, keep waiting, or fail with the ACME detail. */
export function certVerdict(status: string, statusDetails?: string): 'ready' | 'wait' {
  if (status === 'ready') return 'ready'
  if (status === 'error') {
    throw new Error(`certificate issuance failed${statusDetails ? `: ${statusDetails}` : ''} — fix the cause (usually DNS), then redeploy; tasks/repair-certs.ts removes the errored cert first.`)
  }
  return 'wait'
}

/** Resolvers polled for propagation; both must answer with the LB IP. */
const PUBLIC_RESOLVERS = ['8.8.8.8', '1.1.1.1']

const DNS_TIMEOUT_MS = 300_000
const CERT_TIMEOUT_MS = 600_000
const POLL_INTERVAL_MS = 5_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface DnsGateState {
  fqdn: string
  expectedIp: string
}

const dnsPropagationProvider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: DnsGateState) {
    const { Resolver } = await import('node:dns/promises')
    const deadline = Date.now() + DNS_TIMEOUT_MS
    let lastSeen = 'no answers yet'
    while (Date.now() < deadline) {
      const answersPerResolver = await Promise.all(
        PUBLIC_RESOLVERS.map(async (server) => {
          const resolver = new Resolver({ timeout: 3_000, tries: 1 })
          resolver.setServers([server])
          return resolver.resolve4(inputs.fqdn).catch(() => [] as string[])
        }),
      )
      if (dnsAnswersSatisfy(answersPerResolver, inputs.expectedIp)) {
        return { id: `${inputs.fqdn}=${inputs.expectedIp}`, outs: inputs }
      }
      lastSeen = PUBLIC_RESOLVERS.map((server, i) => `${server}→[${answersPerResolver[i]!.join(',') || 'NXDOMAIN'}]`).join(' ')
      await sleep(POLL_INTERVAL_MS)
    }
    throw new Error(
      `DNS for ${inputs.fqdn} did not propagate to ${inputs.expectedIp} within ${DNS_TIMEOUT_MS / 1000}s (${lastSeen}) — certificates were NOT requested against stale DNS; re-run the deploy once the record resolves.`,
    )
  },
}

/** Blocks until `fqdn` resolves to `expectedIp` on public resolvers. Create-only. */
export class DnsPropagationGate extends pulumi.dynamic.Resource {
  constructor(name: string, args: { fqdn: pulumi.Input<string>; expectedIp: pulumi.Input<string> }, opts?: pulumi.CustomResourceOptions) {
    super(dnsPropagationProvider, name, args, opts)
  }
}

interface CertGateState {
  /** Pulumi resource id of the certificate: `<zone>/<uuid>`. */
  certificateId: string
}

const certReadyProvider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: CertGateState) {
    const [zone, certId] = inputs.certificateId.split('/')
    if (!zone || !certId) throw new Error(`CertReadyGate: certificate id '${inputs.certificateId}' is not '<zone>/<uuid>'`)
    const secretKey = process.env.SCW_SECRET_KEY
    if (!secretKey) throw new Error('CertReadyGate: SCW_SECRET_KEY is not set in the deploy environment')
    const deadline = Date.now() + CERT_TIMEOUT_MS
    while (true) {
      const res = await fetch(`https://api.scaleway.com/lb/v1/zones/${zone}/certificates/${certId}`, {
        headers: { 'X-Auth-Token': secretKey },
      })
      if (!res.ok) throw new Error(`CertReadyGate: GET certificate ${certId} → ${res.status}: ${await res.text()}`)
      const cert = (await res.json()) as { status: string; status_details?: string }
      if (certVerdict(cert.status, cert.status_details) === 'ready') {
        return { id: certId, outs: inputs }
      }
      if (Date.now() >= deadline) {
        throw new Error(`CertReadyGate: certificate ${certId} still '${cert.status}' after ${CERT_TIMEOUT_MS / 1000}s`)
      }
      await sleep(POLL_INTERVAL_MS)
    }
  },
}

/** Blocks until the LB certificate is `ready`; fails the deploy AT the cert
 *  (with the ACME detail) when issuance errored. Create-only. */
export class CertReadyGate extends pulumi.dynamic.Resource {
  constructor(name: string, args: { certificateId: pulumi.Input<string> }, opts?: pulumi.CustomResourceOptions) {
    super(certReadyProvider, name, args, opts)
  }
}
