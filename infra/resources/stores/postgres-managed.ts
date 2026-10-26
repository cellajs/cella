import { parseAclInput } from '../../lib/db-exposure-acl';
import { DB_INSTANCE_RESOURCE } from '../../lib/db-public-endpoint';
import type { ProvisionContext, ProvisionedStore, StoreProvisioner, StoreSecretContribution } from '../../lib/stores';

/** Roles provisioned on the instance. Each maps to a PostgreSQL user + DSN. */
export type PostgresRole = 'admin' | 'runtime' | 'cdc';

/** Configuration for a managed Scaleway PostgreSQL store. */
export interface PostgresManagedConfig {
  /** Roles to provision, all three by default: `admin` has REPLICATION and owns the RLS tables (Scaleway grants no BYPASSRLS), `runtime` is RLS-subject, and `cdc` reuses admin credentials for the replication slot. */
  roles?: readonly PostgresRole[];
  /** Enable PostgreSQL logical replication via instance settings and expose the cdc connection string. Defaults to true. */
  logicalReplication?: boolean;
  /** Services consuming each role's DSN and the instance CA. When set the store owns the secret declarations; when omitted `runtime-secrets.config.ts` must declare them and the store only binds values. */
  secretConsumers?: { runtime?: readonly string[]; admin?: readonly string[]; cdc?: readonly string[]; ca?: readonly string[] };
}

/** Managed Scaleway PostgreSQL store: an RDB instance with per-role users and RLS-backing privileges, binding the runtime/admin/cdc DSNs and the instance CA to their runtime secrets. Pure at import time. */
export function postgresManaged(config: PostgresManagedConfig = {}): StoreProvisioner {
  const logicalReplication = config.logicalReplication ?? true;

  return {
    kind: 'postgres-managed',

    secrets(): StoreSecretContribution[] {
      const consumers = config.secretConsumers;
      if (!consumers) return [];
      const contributions: StoreSecretContribution[] = [];
      // The per-consumer union is genId-fingerprinted, so reordering these declarations rolls every generation.
      if (consumers.runtime) {
        contributions.push({
          id: 'databaseUrlRuntime',
          secretName: 'database-url-runtime',
          envVar: 'DATABASE_URL',
          description: 'PostgreSQL runtime_role connection string (backend API, subject to RLS)',
          required: true,
          valueSource: 'engine',
          services: consumers.runtime,
          database: { role: 'runtime' },
        });
      }
      if (consumers.admin) {
        contributions.push({
          id: 'databaseUrlAdmin',
          secretName: 'database-url-admin',
          envVar: 'DATABASE_ADMIN_URL',
          description: 'PostgreSQL admin_role connection string (migrations, seeds, owner of the RLS tables)',
          required: true,
          valueSource: 'engine',
          services: consumers.admin,
          database: { role: 'admin' },
        });
      }
      if (consumers.cdc) {
        contributions.push({
          id: 'databaseUrlCdc',
          secretName: 'database-url-cdc',
          envVar: 'DATABASE_CDC_URL',
          description: 'PostgreSQL CDC worker connection string (admin_role with replication access)',
          required: true,
          valueSource: 'engine',
          services: consumers.cdc,
          database: { role: 'admin' },
        });
      }
      if (consumers.ca) {
        contributions.push({
          id: 'databaseSslCa',
          secretName: 'database-ssl-ca',
          envVar: 'DATABASE_SSL_CA',
          description:
            'base64-encoded PEM CA cert of the Scaleway RDB instance, used by services to verify the PostgreSQL TLS connection (derived by pulumi from the database instance; base64 keeps the multi-line PEM deliverable through the line-based .env.runtime)',
          required: true,
          valueSource: 'engine',
          services: consumers.ca,
        });
      }
      return contributions;
    },

    provision(ctx: ProvisionContext): ProvisionedStore {
      const { pulumi, scaleway, naming, region, isProduction, sizing, privateNetworkId } = ctx;

      const infraConfig = new pulumi.Config('infra');

      const dbNodeType = sizing.dbNodeType;
      const dbVolumeSize = sizing.dbVolumeSize;

      // Shared with the reset task via `naming`.
      const dbSlug = naming.dbName;

      // Opt-in public endpoint for scoped operator tasks: `infra:dbPublicEndpoint` enables it, `infra:dbPublicAcl` limits client CIDRs, and unsetting both returns the database to private-only.
      const dbPublicEndpoint = infraConfig.getBoolean('dbPublicEndpoint') ?? false;

      // Checked here too, not only in the CLI prompt: a hand-set config reaches this resource directly, and without an ACL the endpoint opens on Scaleway's default rule 0.0.0.0/0. `infra:dbPublicAclAllowWide` admits prefixes wider than /24, never the whole internet.
      const acl = dbPublicEndpoint
        ? parseAclInput(infraConfig.get('dbPublicAcl') ?? '', infraConfig.getBoolean('dbPublicAclAllowWide') ?? false)
        : undefined;
      if (acl && !acl.ok) throw new Error(`Security: infra:dbPublicAcl is refused: ${acl.reason}.`);

      // PostgreSQL Instance

      // Scaleway exposes logical replication only as vendor settings; feedback and synchronized slots preserve CDC across managed HA failovers.
      const replicationSettings = logicalReplication
        ? { 'rdb.enable_logical_replication': 'true', hot_standby_feedback: 'on', sync_replication_slots: 'on' }
        : undefined;

      const instance = new scaleway.databases.Instance(
        DB_INSTANCE_RESOURCE,
        {
          name: naming.resource('postgres'),
          region,
          nodeType: dbNodeType,
          engine: 'PostgreSQL-17',
          volumeType: 'sbs_5k',
          volumeSizeInGb: dbVolumeSize,
          isHaCluster: false,
          disableBackup: !isProduction,
          privateNetwork: { pnId: privateNetworkId, enableIpam: true },
          settings: replicationSettings,
          // `loadBalancer` is also an always-present output, so leaving it out keeps an existing endpoint: closing deletes it over the RDB API
          // (cli/actions/db-exposure.ts), and a refresh of this instance before an expose lets `{}` plan a new one.
          loadBalancer: dbPublicEndpoint ? {} : undefined,
        },
        { deleteBeforeReplace: true, protect: isProduction },
      );

      if (acl?.ok) {
        new scaleway.databases.Acl('main-postgres-acl', {
          instanceId: instance.id,
          region,
          aclRules: acl.cidrs.map((cidr) => ({ ip: cidr, description: 'operator (temporary)' })),
        });
      }

      const database = new scaleway.databases.Database('main-database', { instanceId: instance.id, name: dbSlug, region });

      // The roles, their passwords and privileges, and the connection strings are made by the operator task ensure-database through the
      // database API, so no password passes through the state (tasks/ensure-database.ts).

      // The instance is created with a privateNetwork block; this only trips when Scaleway returns one without it, and names the cause where an undefined-property crash would not.
      const privateNetwork = instance.privateNetwork.apply((pn) => {
        if (!pn) throw new Error('database: main-postgres has no private network endpoint');
        return pn;
      });

      const host = privateNetwork.hostname;
      const ip = privateNetwork.ip;
      const port = privateNetwork.port;

      return {
        outputs: {
          instanceId: instance.id,
          host,
          databaseName: database.name,
          // The private endpoint the operator task assembles the connection strings from.
          privateIp: ip,
          port: port.apply(String),
          // The public endpoint while one is open, empty otherwise: an operator's break-glass connection string.
          publicHost: instance.loadBalancer.apply((lb) => (dbPublicEndpoint ? lb?.hostname || lb?.ip || '' : '')),
          publicPort: instance.loadBalancer.apply((lb) => (dbPublicEndpoint && lb?.port ? String(lb.port) : '')),
          // Instance CA certificate (PEM) for verifying the TLS connection, also base64-encoded into the CA runtime secret below. It is public.
          caCertificate: instance.certificate,
        },
        secretValues: {
          // Base64-encoded for line-based `.env.runtime` delivery; clients decode it back to PEM.
          databaseSslCa: instance.certificate.apply((pem) => Buffer.from(pem, 'utf-8').toString('base64')),
        },
      };
    },
  };
}
