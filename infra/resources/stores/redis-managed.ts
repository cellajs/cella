import type { ProvisionContext, ProvisionedStore, StoreProvisioner, StoreSecretContribution } from '../../lib/stores';

/** Configuration for a managed Scaleway Redis store. */
export interface RedisManagedConfig {
  /** Redis engine version, e.g. `'7.0.5'` (Scaleway-supported versions only). */
  version: string;
  /** Cluster node type, e.g. `'RED1-MICRO'`. */
  nodeType: string;
  /** Node count. 1 = standalone; 3+ switches to cluster mode. Defaults to 1. */
  clusterSize?: number;
  /** First ACL user name. Defaults to `'default'`. */
  userName?: string;
  /** Terminate connections with TLS (rediss scheme). Defaults to true. */
  tls?: boolean;
  /** Permit a public cluster endpoint, off by default: the provider-formatted `connectionString` prefers a public endpoint when one exists, which would make REDIS_URL internet-reachable. */
  allowPublicEndpoint?: boolean;
  /** Services consuming the connection URL and, with TLS, the cluster CA. When set, the store owns the secret declarations. */
  secretConsumers?: {
    url?: readonly string[];
    ca?: readonly string[];
  };
}

/** Managed Scaleway Redis store: a cluster on the deployment's private network, binding its connection URL and TLS CA to runtime secrets. Pure at import time. */
export function redisManaged(config: RedisManagedConfig): StoreProvisioner {
  const tls = config.tls ?? true;

  return {
    kind: 'redis-managed',

    validate(): void {
      if (!tls && config.secretConsumers?.ca?.length) {
        throw new Error(
          'redisManaged: secretConsumers.ca declared but tls is disabled, no CA secret would be emitted. Enable tls or drop the ca consumers.',
        );
      }
    },

    secrets(): StoreSecretContribution[] {
      const consumers = config.secretConsumers;
      if (!consumers) return [];
      const contributions: StoreSecretContribution[] = [];
      if (consumers.url) {
        contributions.push({
          id: 'redisUrl',
          secretName: 'redis-url',
          envVar: 'REDIS_URL',
          description: 'Managed Redis connection URL (derived by pulumi from the cluster)',
          required: true,
          valueSource: 'pulumi',
          services: consumers.url,
        });
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
        });
      }
      return contributions;
    },

    provision(ctx: ProvisionContext): ProvisionedStore {
      const { scaleway, naming, zone, isProduction, privateNetworkId, configuredOrRandomSecret } = ctx;

      // Stable resource identity for the live credential; renaming re-rolls it.
      const password = configuredOrRandomSecret('redisPassword', 'redis-password');

      const cluster = new scaleway.redis.Cluster(
        'main-redis',
        {
          name: naming.resource('redis'),
          version: config.version,
          nodeType: config.nodeType,
          clusterSize: config.clusterSize ?? 1,
          userName: config.userName ?? 'default',
          password,
          tlsEnabled: tls,
          zone,
          privateNetworks: [{ id: privateNetworkId }],
        },
        { protect: isProduction },
      );

      // Provider-formatted URI for the first reachable endpoint. The provider prefers a public endpoint when one exists, so an unapproved public network fails the deploy and never emits an internet-reachable REDIS_URL.
      const connectionString = cluster.publicNetwork.apply((publicNetwork) => {
        if (!config.allowPublicEndpoint && (publicNetwork?.ips?.length ?? 0) > 0) {
          throw new Error(
            'redisManaged: the cluster has a public endpoint but allowPublicEndpoint is not set, the emitted REDIS_URL would prefer it. Opt in explicitly or remove the public network.',
          );
        }
        return cluster.connectionString;
      });

      return {
        outputs: {
          clusterId: cluster.id,
          connectionString,
          certificate: cluster.certificate,
        },
        secretValues: {
          redisUrl: connectionString,
          ...(tls
            ? {
                // Base64-encoded for line-based `.env.runtime` delivery.
                redisSslCa: cluster.certificate.apply((pem) => Buffer.from(pem, 'utf-8').toString('base64')),
              }
            : {}),
        },
      };
    },
  };
}
