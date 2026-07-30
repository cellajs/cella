import type { ProvisionContext, ProvisionedStore, StoreProvisioner, StoreSecretContribution } from '../../lib/stores'

/** Configuration for a managed Scaleway Redis store. */
export interface RedisManagedConfig {
  /** Redis engine version, e.g. `'7.0.5'` (Scaleway-supported versions only). */
  version: string
  /** Cluster node type, e.g. `'RED1-MICRO'`. */
  nodeType: string
  /** Node count. 1 = standalone; 3+ switches to cluster mode. Defaults to 1. */
  clusterSize?: number
  /** First ACL user name. Defaults to `'default'`. */
  userName?: string
  /** Terminate connections with TLS (rediss scheme). Defaults to true. */
  tls?: boolean
  /**
   * Services that consume the connection URL (and, with TLS, the cluster CA)
   * as runtime secrets. When set, the store owns the secret declarations.
   */
  secretConsumers?: {
    url?: readonly string[]
    ca?: readonly string[]
  }
}

/**
 * Managed Scaleway Redis store: provisions a Redis cluster on the deployment's
 * private network and binds its connection URL (plus the TLS CA) to runtime
 * secrets. Pure at import time; Pulumi access arrives through the
 * {@link ProvisionContext}.
 */
export function redisManaged(config: RedisManagedConfig): StoreProvisioner {
  const tls = config.tls ?? true

  return {
    kind: 'redis-managed',

    secrets(): StoreSecretContribution[] {
      const consumers = config.secretConsumers
      if (!consumers) return []
      const contributions: StoreSecretContribution[] = []
      if (consumers.url) {
        contributions.push({
          id: 'redisUrl',
          secretName: 'redis-url',
          envVar: 'REDIS_URL',
          description: 'Managed Redis connection URL (derived by pulumi from the cluster)',
          required: true,
          valueSource: 'pulumi',
          services: consumers.url,
        })
      }
      if (tls && consumers.ca) {
        contributions.push({
          id: 'redisSslCa',
          secretName: 'redis-ssl-ca',
          envVar: 'REDIS_SSL_CA',
          description: 'base64-encoded PEM CA cert of the managed Redis cluster TLS endpoint',
          required: true,
          valueSource: 'pulumi',
          services: consumers.ca,
        })
      }
      return contributions
    },

    provision(ctx: ProvisionContext): ProvisionedStore {
      const { scaleway, naming, zone, isProduction, privateNetworkId, configuredOrRandomSecret } = ctx

      // Stable resource identity for the live credential, mirroring the
      // postgres role passwords.
      const password = configuredOrRandomSecret('redisPassword', 'redis-password')

      const cluster = new scaleway.redis.Cluster('main-redis', {
        name: naming.resource('redis'),
        version: config.version,
        nodeType: config.nodeType,
        clusterSize: config.clusterSize ?? 1,
        userName: config.userName ?? 'default',
        password,
        tlsEnabled: tls,
        zone,
        privateNetworks: [{ id: privateNetworkId }],
      }, { protect: isProduction })

      return {
        outputs: {
          clusterId: cluster.id,
          // Provider-formatted URI for the first reachable endpoint; rediss
          // scheme when TLS is enabled, userinfo included.
          connectionString: cluster.connectionString,
          certificate: cluster.certificate,
        },
        secretValues: {
          redisUrl: cluster.connectionString,
          ...(tls
            ? {
                // Base64-encode the multiline CA for line-based `.env.runtime`
                // delivery, mirroring the postgres CA secret.
                redisSslCa: cluster.certificate.apply((pem) => Buffer.from(pem, 'utf-8').toString('base64')),
              }
            : {}),
        },
      }
    },
  }
}
