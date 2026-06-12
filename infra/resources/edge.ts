/**
 * Edge Services — CDN with TLS termination in front of the frontend SPA bucket.
 *
 * Pipeline stages: backend (S3 website origin) → TLS (managed Let's Encrypt) →
 * DNS (app FQDN) → head (entry point). Disabled by default (`infra:enableEdgeServices`);
 * the frontend is normally served by the Caddy proxy VM behind the LB.
 */
import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { naming, region, serviceHost, infra } from '../pulumi-context'
import { frontendBucketName } from './storage'

let _pipelineId: pulumi.Output<string> | undefined

if (infra.enableEdgeServices) {
  // ---------------------------------------------------------------------------
  // Pipeline
  // ---------------------------------------------------------------------------

  const pipeline = new scaleway.edgeservices.Pipeline('frontend-cdn', {
    name: naming.resource('frontend-cdn'),
    description: `Edge Services for ${naming.slug} frontend`,
  }, { aliases: [{ type: 'scaleway:index/edgeServicesPipeline:EdgeServicesPipeline' }] })

  // ---------------------------------------------------------------------------
  // Backend stage — S3 origin (website mode for SPA routing)
  // ---------------------------------------------------------------------------

  const backendStage = new scaleway.edgeservices.BackendStage('frontend-backend', {
    pipelineId: pipeline.id,
    s3BackendConfig: {
      bucketName: frontendBucketName,
      bucketRegion: region,
      isWebsite: true,
    },
  }, { aliases: [{ type: 'scaleway:index/edgeServicesBackendStage:EdgeServicesBackendStage' }] })

  // ---------------------------------------------------------------------------
  // WAF stage (optional) — inspects requests before they hit origin.
  // Enable via `pulumi config set infra:enableWaf true`.
  // ---------------------------------------------------------------------------

  let tlsUpstream: { backendStageId?: pulumi.Output<string>; wafStageId?: pulumi.Output<string> } = {
    backendStageId: backendStage.id,
  }

  if (infra.enableWaf) {
    const wafStage = new scaleway.edgeservices.WafStage('frontend-waf', {
      pipelineId: pipeline.id,
      backendStageId: backendStage.id,
      mode: 'enable',
      paranoiaLevel: 1,
    }, { aliases: [{ type: 'scaleway:index/edgeServicesWafStage:EdgeServicesWafStage' }] })
    tlsUpstream = { wafStageId: wafStage.id }
  }

  // ---------------------------------------------------------------------------
  // TLS stage — managed Let's Encrypt certificate
  // ---------------------------------------------------------------------------

  const tlsStage = new scaleway.edgeservices.TlsStage('frontend-tls', {
    pipelineId: pipeline.id,
    ...tlsUpstream,
    managedCertificate: true,
  }, { aliases: [{ type: 'scaleway:index/edgeServicesTlsStage:EdgeServicesTlsStage' }] })

  // ---------------------------------------------------------------------------
  // DNS stage — attach custom domain(s)
  // Only the app domain (e.g. www.cellajs.com) is served by Edge Services.
  // The apex domain (cellajs.com) is handled by the load balancer with a 301 redirect.
  // ---------------------------------------------------------------------------

  const dnsStage = new scaleway.edgeservices.DnsStage('frontend-dns', {
    pipelineId: pipeline.id,
    tlsStageId: tlsStage.id,
    fqdns: [serviceHost('frontend')],
  }, { aliases: [{ type: 'scaleway:index/edgeServicesDnsStage:EdgeServicesDnsStage' }] })

  // ---------------------------------------------------------------------------
  // Head stage — pipeline entry point
  // ---------------------------------------------------------------------------

  new scaleway.edgeservices.HeadStage('frontend-head', {
    pipelineId: pipeline.id,
    headStageId: dnsStage.id,
  })

  _pipelineId = pipeline.id
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** Pipeline ID (undefined if no domain) */
export const pipelineId = _pipelineId
