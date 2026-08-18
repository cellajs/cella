import type * as pulumi from '@pulumi/pulumi';
import type { ProvisionContext, ProvisionedStore, StoreProvisioner, StoreSecretContribution } from '../../lib/stores';

/** Roles provisioned on the instance. Each maps to a PostgreSQL user + DSN. */
export type PostgresRole = 'admin' | 'runtime' | 'cdc';

/** Configuration for a managed Scaleway PostgreSQL store. */
export interface PostgresManagedConfig {
  /** Roles to provision, all three by default: `admin` has BYPASSRLS and REPLICATION, `runtime` is RLS-subject, and `cdc` reuses admin credentials for the replication slot. */
  roles?: readonly PostgresRole[];
  /** Enable PostgreSQL logical replication via instance settings and expose the cdc connection string. Defaults to true. */
  logicalReplication?: boolean;
  /** Services consuming each role's DSN and the instance CA. When set the store owns the secret declarations; when omitted `runtime-secrets.config.ts` must declare them and the store only binds values. */
  secretConsumers?: {
    runtime?: readonly string[];
    admin?: readonly string[];
    cdc?: readonly string[];
    ca?: readonly string[];
  };
}

/**
 * Assemble a PostgreSQL DSN from plain string parts. User and password are percent-encoded so credentials cannot break out of the userinfo segment.
 * Always pins `sslmode=require&uselibpqcompat=true`: Scaleway private endpoints use self-signed certs, so libpq-compat mode encrypts without cert verification.
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

      const infraConfig = new pulumi.Config('infra');

      const dbNodeType = sizing.dbNodeType;
      const dbVolumeSize = sizing.dbVolumeSize;

      // Shared with the reset task via `naming`.
      const dbSlug = naming.dbName;

      // One password per role, from a stack config secret or generated. The `<role>-password` resource names are the Pulumi identities of the live credentials; renaming re-rolls them.
      function rolePassword(name: string): pulumi.Output<string> {
        return configuredOrRandomSecret(`${name}Password`, `${name}-password`);
      }

      const adminPassword = rolePassword('admin');
      const runtimePassword = rolePassword('runtime');

      // Opt-in public endpoint for scoped operator tasks: `infra:dbPublicEndpoint` enables it, `infra:dbPublicAcl` limits client CIDRs, and unsetting both returns the database to private-only.
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

      // Scaleway exposes logical replication only as vendor settings; feedback and synchronized slots preserve CDC across managed HA failovers.
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

      const database = new scaleway.databases.Database('main-database', {
        instanceId: instance.id,
        name: dbSlug,
        region,
      });

      // One user per role: admin_role runs migrations, seeds, system jobs and CDC (isAdmin gives BYPASSRLS and REPLICATION); runtime_role serves app requests under RLS.

      const adminUser = new scaleway.databases.User('admin-user', {
        instanceId: instance.id,
        name: 'admin_role',
        password: adminPassword,
        isAdmin: true, // grants BYPASSRLS + REPLICATION at Scaleway level
        region,
      });

      const runtimeUser = new scaleway.databases.User('runtime-user', {
        instanceId: instance.id,
        name: 'runtime_role',
        password: runtimePassword,
        isAdmin: false,
        region,
      });

      // Each role gets 'all' at creation, after which the role/RLS migrations own the effective grants and their REVOKEs make Scaleway read the privilege back as 'custom'.
      // ignoreChanges stops a refresh from re-enforcing 'all' over migration-owned grants, which CI cannot execute anyway under RelationalDatabasesReadOnly.

      new scaleway.databases.Privilege(
        'admin-privilege',
        {
          instanceId: instance.id,
          databaseName: database.name,
          userName: adminUser.name,
          permission: 'all',
          region,
        },
        { ignoreChanges: ['permission'] },
      );

      new scaleway.databases.Privilege(
        'runtime-privilege',
        {
          instanceId: instance.id,
          databaseName: database.name,
          userName: runtimeUser.name,
          permission: 'all',
          region,
        },
        { ignoreChanges: ['permission'] },
      );

      // The instance is created with a privateNetwork block; this only trips when Scaleway returns one without it, and names the cause where an undefined-property crash would not.
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
      // CDC uses admin credentials: Scaleway grants the REPLICATION attribute, required to open a logical replication slot, only to isAdmin users.
      const connectionStringCdc = buildConnectionString(adminUser.name, adminPassword);

      // Optional public admin DSN, preferring the endpoint hostname over its IP. Disabled or unavailable endpoints yield an empty string.
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
          // Instance CA certificate (PEM) for verifying the TLS connection, also base64-encoded into the CA runtime secret below.
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
          // Base64-encoded for line-based `.env.runtime` delivery; clients decode it back to PEM.
          databaseSslCa: instance.certificate.apply((pem) => Buffer.from(pem, 'utf-8').toString('base64')),
        },
      };
    },
  };
}
