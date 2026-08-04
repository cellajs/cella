import type * as pulumi from '@pulumi/pulumi';
import type { ProvisionContext, ProvisionedStore, StoreProvisioner, StoreSecretContribution } from '../../lib/stores';

/** Roles provisioned on the instance. Each maps to a PostgreSQL user + DSN. */
export type PostgresRole = 'admin' | 'runtime' | 'cdc';

/** Configuration for a managed Scaleway PostgreSQL store. */
export interface PostgresManagedConfig {
  /**
   * Roles to provision. `admin` (BYPASSRLS + REPLICATION) and `runtime`
   * (RLS-subject) are the app boundary; `cdc` reuses admin creds for the
   * replication slot. Defaults to all three.
   */
  roles?: readonly PostgresRole[];
  /**
   * Enable PostgreSQL logical replication (the CDC slot) via instance settings
   * and expose the cdc connection string. Defaults to true.
   */
  logicalReplication?: boolean;
  /**
   * Services that consume each role's DSN (and the instance CA) as runtime
   * secrets. When set, the store owns the secret declarations; when omitted,
   * the app's `runtime-secrets.config.ts` must declare them and the store only
   * binds values.
   */
  secretConsumers?: {
    runtime?: readonly string[];
    admin?: readonly string[];
    cdc?: readonly string[];
    ca?: readonly string[];
  };
}

/**
 * Assemble a PostgreSQL DSN from plain string parts.
 *
 * User and password are percent-encoded so credentials containing `@`, `:`,
 * `/`, `?`, `#` or `&` cannot break out of the userinfo segment. Always pins
 * `sslmode=require&uselibpqcompat=true`: Scaleway private endpoints use
 * self-signed certs, so libpq-compat mode encrypts without cert verification.
 *
 * Exported for unit testing; the Output-wrapping helpers below call it.
 */
export function formatPostgresUrl(
  user: string,
  pass: string,
  host: string,
  port: number | string,
  database: string,
): string {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${database}?sslmode=require&uselibpqcompat=true`;
}

/**
 * Managed Scaleway PostgreSQL store: provisions an RDB instance with per-role
 * users and RLS-backing privileges, and binds the runtime/admin/cdc DSNs plus
 * the instance CA to their runtime secrets. Row-level security and CDC are
 * capabilities of this store, not engine concepts. Pure at import time; all
 * Pulumi access arrives through the {@link ProvisionContext}.
 */
export function postgresManaged(config: PostgresManagedConfig = {}): StoreProvisioner {
  const logicalReplication = config.logicalReplication ?? true;

  return {
    kind: 'postgres-managed',

    secrets(): StoreSecretContribution[] {
      const consumers = config.secretConsumers;
      if (!consumers) return [];
      const contributions: StoreSecretContribution[] = [];
      // Declaration order mirrors the historical app-config order: the union
      // per consumer is genId-fingerprinted, so reordering rolls generations.
      if (consumers.runtime) {
        contributions.push({
          id: 'databaseUrlRuntime',
          secretName: 'database-url-runtime',
          envVar: 'DATABASE_URL',
          description: 'PostgreSQL runtime_role connection string (backend API, subject to RLS)',
          required: true,
          valueSource: 'pulumi',
          services: consumers.runtime,
        });
      }
      if (consumers.admin) {
        contributions.push({
          id: 'databaseUrlAdmin',
          secretName: 'database-url-admin',
          envVar: 'DATABASE_ADMIN_URL',
          description: 'PostgreSQL admin_role connection string (migrations, seeds, BYPASSRLS)',
          required: true,
          valueSource: 'pulumi',
          services: consumers.admin,
        });
      }
      if (consumers.cdc) {
        contributions.push({
          id: 'databaseUrlCdc',
          secretName: 'database-url-cdc',
          envVar: 'DATABASE_CDC_URL',
          description: 'PostgreSQL CDC worker connection string (admin_role with replication access)',
          required: true,
          valueSource: 'pulumi',
          services: consumers.cdc,
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
          valueSource: 'pulumi',
          services: consumers.ca,
        });
      }
      return contributions;
    },

    provision(ctx: ProvisionContext): ProvisionedStore {
      const { pulumi, scaleway, naming, region, isProduction, sizing, privateNetworkId, configuredOrRandomSecret } =
        ctx;

      // Stack config for infrastructure opt-ins (public endpoint exposure).
      const infraConfig = new pulumi.Config('infra');

      const dbNodeType = sizing.dbNodeType;
      const dbVolumeSize = sizing.dbVolumeSize;

      // Database name derived from the app slug. Shared with the reset task via `naming`.
      const dbSlug = naming.dbName;

      // Passwords: one per role, each from stack config secret or generated.
      // Resource names (`<role>-password`) are load-bearing: they are the shipped
      // Pulumi identities of the live credentials.
      function rolePassword(name: string): pulumi.Output<string> {
        return configuredOrRandomSecret(`${name}Password`, `${name}-password`);
      }

      const adminPassword = rolePassword('admin');
      const runtimePassword = rolePassword('runtime');

      // Opt-in public endpoint for scoped operator tasks such as data migrations.
      // `infra:dbPublicEndpoint` enables it; `infra:dbPublicAcl` limits client CIDRs.
      // Unset both after the task to return the database to private-only access.
      const dbPublicEndpoint = infraConfig.getBoolean('dbPublicEndpoint') ?? false;
      const dbPublicAcl = infraConfig.get('dbPublicAcl') ?? '';

      if (dbPublicEndpoint && !dbPublicAcl) {
        throw new Error(
          'Security: infra:dbPublicAcl must be set when infra:dbPublicEndpoint=true. ' +
            'An open public endpoint with no ACL exposes the database to the internet. ' +
            'Example: pulumi config set infra:dbPublicAcl "203.0.113.0/32"',
        );
      }

      // PostgreSQL Instance

      // Scaleway exposes only vendor settings for PostgreSQL logical replication.
      // Feedback and synchronized slots preserve CDC across managed HA failovers.
      const replicationSettings = logicalReplication
        ? { 'rdb.enable_logical_replication': 'true', hot_standby_feedback: 'on', sync_replication_slots: 'on' }
        : undefined;

      const instance = new scaleway.databases.Instance(
        'main-postgres',
        {
          name: naming.resource('postgres'),
          region,
          nodeType: dbNodeType,
          engine: 'PostgreSQL-17',
          volumeType: 'sbs_5k',
          volumeSizeInGb: dbVolumeSize,
          isHaCluster: false,
          disableBackup: !isProduction,
          privateNetwork: {
            pnId: privateNetworkId,
            enableIpam: true,
          },
          settings: replicationSettings,
          loadBalancer: dbPublicEndpoint ? {} : undefined,
        },
        {
          aliases: [{ type: 'scaleway:index/databaseInstance:DatabaseInstance' }],
          deleteBeforeReplace: true,
          protect: isProduction,
        },
      );

      if (dbPublicEndpoint && dbPublicAcl) {
        new scaleway.databases.Acl('main-postgres-acl', {
          instanceId: instance.id,
          region,
          aclRules: dbPublicAcl.split(',').map((cidr) => ({
            ip: cidr.trim(),
            description: 'operator (temporary)',
          })),
        });
      }

      // Database

      const database = new scaleway.databases.Database(
        'main-database',
        {
          instanceId: instance.id,
          name: dbSlug,
          region,
        },
        { aliases: [{ type: 'scaleway:index/database:Database' }] },
      );

      // Users: one per role, matching the PostgreSQL roles used by the application.
      // admin_role: migrations, seeds, system jobs, CDC worker (isAdmin gives BYPASSRLS + REPLICATION)
      // runtime_role: authenticated app requests, subject to RLS

      const adminUser = new scaleway.databases.User(
        'admin-user',
        {
          instanceId: instance.id,
          name: 'admin_role',
          password: adminPassword,
          isAdmin: true, // grants BYPASSRLS + REPLICATION at Scaleway level
          region,
        },
        { aliases: [{ type: 'scaleway:index/databaseUser:DatabaseUser' }] },
      );

      const runtimeUser = new scaleway.databases.User('runtime-user', {
        instanceId: instance.id,
        name: 'runtime_role',
        password: runtimePassword,
        isAdmin: false,
        region,
      });

      // Privileges: each role gets 'all' on the database (fine-grained table
      // permissions are enforced by the RLS migration, not Scaleway-level grants)

      new scaleway.databases.Privilege('admin-privilege', {
        instanceId: instance.id,
        databaseName: database.name,
        userName: adminUser.name,
        permission: 'all',
        region,
      });

      new scaleway.databases.Privilege('runtime-privilege', {
        instanceId: instance.id,
        databaseName: database.name,
        userName: runtimeUser.name,
        permission: 'all',
        region,
      });

      // The instance is created with a privateNetwork block, so this only trips if
      // Scaleway ever returns an instance without one, fail with a real error
      // before an opaque undefined-property crash can occur.
      const privateNetwork = instance.privateNetwork.apply((pn) => {
        if (!pn) throw new Error('database: main-postgres has no private network endpoint');
        return pn;
      });

      const host = privateNetwork.hostname;
      const ip = privateNetwork.ip;
      const port = privateNetwork.port;

      /** Build a connection string for the private network endpoint. */
      function buildConnectionString(user: pulumi.Output<string>, pass: pulumi.Output<string>): pulumi.Output<string> {
        return pulumi
          .all([user, pass, ip, port, database.name])
          .apply(([u, p, h, pt, db]) => formatPostgresUrl(u, p, h, pt, db));
      }

      // Admin connection for migrations, seeds, system jobs (BYPASSRLS).
      const connectionStringAdmin = buildConnectionString(adminUser.name, adminPassword);
      // Runtime connection for backend API requests (subject to RLS).
      const connectionStringRuntime = buildConnectionString(runtimeUser.name, runtimePassword);
      // CDC connection for the CDC worker (append-only + logical replication).
      // Uses admin credentials because Scaleway only grants the REPLICATION role
      // attribute (required to open a logical replication slot) to isAdmin users.
      const connectionStringCdc = buildConnectionString(adminUser.name, adminPassword);

      // Optional public admin DSN, preferring endpoint hostname and falling back
      // to IP. Disabled or unavailable endpoints yield an empty string.
      const connectionStringAdminPublic = pulumi
        .all([adminUser.name, adminPassword, instance.loadBalancer, database.name])
        .apply(([u, p, lb, db]) => {
          const publicHost = lb?.hostname || lb?.ip;
          if (!dbPublicEndpoint || !publicHost) return '';
          return formatPostgresUrl(u, p, publicHost, lb.port, db);
        });

      return {
        outputs: {
          instanceId: instance.id,
          host,
          databaseName: database.name,
          // Instance CA certificate (PEM) for verifying the TLS connection to the
          // managed PostgreSQL; also base64-encoded into the CA runtime secret below.
          caCertificate: instance.certificate,
          connectionStringAdmin,
          connectionStringRuntime,
          connectionStringCdc,
          connectionStringAdminPublic,
        },
        secretValues: {
          databaseUrlAdmin: connectionStringAdmin,
          databaseUrlRuntime: connectionStringRuntime,
          databaseUrlCdc: connectionStringCdc,
          // Base64-encode the multiline RDB CA for line-based `.env.runtime`
          // delivery. Database clients decode it back to PEM.
          databaseSslCa: instance.certificate.apply((pem) => Buffer.from(pem, 'utf-8').toString('base64')),
        },
      };
    },
  };
}
