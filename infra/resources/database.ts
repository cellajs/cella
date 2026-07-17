import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { naming, region, infraConfig, infra, isProduction } from '../pulumi-context'
import { configuredOrRandomSecret } from './configured-secret'
import { privateNetworkId } from './network'

const dbNodeType = infra.dbNodeType
const dbVolumeSize = infra.dbVolumeSize

/** Database name derived from slug (e.g. 'cella'). Shared with the reset task via `naming`. */
const dbSlug = naming.dbName

// Passwords: one per role, each from stack config secret or generated.

// Resource names (`<role>-password`) are load-bearing: they are the shipped
// Pulumi identities of the live credentials.
function rolePassword(name: string): pulumi.Output<string> {
  return configuredOrRandomSecret(`${name}Password`, `${name}-password`)
}

const adminPassword = rolePassword('admin')
const runtimePassword = rolePassword('runtime')

// Temporary public endpoint for operator tasks (e.g. one-off data migrations).
// `infra:dbPublicEndpoint=true` attaches a public LB endpoint to the instance.
// `infra:dbPublicAcl` is a comma-separated list of CIDRs allowed to connect.
// Both should be unset once the task is done so the DB returns to private-only.
const dbPublicEndpoint = infraConfig.getBoolean('dbPublicEndpoint') ?? false
const dbPublicAcl = infraConfig.get('dbPublicAcl') ?? ''

if (dbPublicEndpoint && !dbPublicAcl) {
  throw new Error(
    'Security: infra:dbPublicAcl must be set when infra:dbPublicEndpoint=true. ' +
    'An open public endpoint with no ACL exposes the database to the internet. ' +
    'Example: pulumi config set infra:dbPublicAcl "203.0.113.0/32"',
  )
}

// PostgreSQL Instance

const instance = new scaleway.databases.Instance('main-postgres', {
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
  // Required for CDC: Scaleway PG-17 uses its own setting keys for logical
  // replication. `rdb.enable_logical_replication` flips wal_level to logical
  // under the hood; `hot_standby_feedback` + `sync_replication_slots` are
  // required to keep slots alive across Scaleway's internal HA failovers.
  // (Raw wal_level / max_wal_senders / max_replication_slots are not user-settable.)
  settings: {
    'rdb.enable_logical_replication': 'true',
    hot_standby_feedback: 'on',
    sync_replication_slots: 'on',
  },
  loadBalancer: dbPublicEndpoint ? {} : undefined,
}, { aliases: [{ type: 'scaleway:index/databaseInstance:DatabaseInstance' }], deleteBeforeReplace: true, protect: isProduction })

if (dbPublicEndpoint && dbPublicAcl) {
  new scaleway.databases.Acl('main-postgres-acl', {
    instanceId: instance.id,
    region,
    aclRules: dbPublicAcl.split(',').map((cidr) => ({
      ip: cidr.trim(),
      description: 'operator (temporary)',
    })),
  })
}

// Database

const database = new scaleway.databases.Database('main-database', {
  instanceId: instance.id,
  name: dbSlug,
  region,
}, { aliases: [{ type: 'scaleway:index/database:Database' }] })

// Users: one per role, matching the PostgreSQL roles used by the application.
// admin_role: migrations, seeds, system jobs, CDC worker (isAdmin gives BYPASSRLS + REPLICATION)
// runtime_role: authenticated app requests, subject to RLS

const adminUser = new scaleway.databases.User('admin-user', {
  instanceId: instance.id,
  name: 'admin_role',
  password: adminPassword,
  isAdmin: true, // grants BYPASSRLS + REPLICATION at Scaleway level
  region,
}, { aliases: [{ type: 'scaleway:index/databaseUser:DatabaseUser' }] })

const runtimeUser = new scaleway.databases.User('runtime-user', {
  instanceId: instance.id,
  name: 'runtime_role',
  password: runtimePassword,
  isAdmin: false,
  region,
})

// Privileges: each role gets 'all' on the database (fine-grained table
// permissions are enforced by the RLS migration, not Scaleway-level grants)

new scaleway.databases.Privilege('admin-privilege', {
  instanceId: instance.id,
  databaseName: database.name,
  userName: adminUser.name,
  permission: 'all',
  region,
})

new scaleway.databases.Privilege('runtime-privilege', {
  instanceId: instance.id,
  databaseName: database.name,
  userName: runtimeUser.name,
  permission: 'all',
  region,
})

// Exports

/** Database instance ID */
export const instanceId = instance.id

/**
 * Instance CA certificate (PEM) for verifying the TLS connection to the managed
 * PostgreSQL. Scaleway issues a per-instance, self-signed CA; this output feeds
 * the `database-ssl-ca` runtime secret (resources/secrets.ts) so app services
 * can pin it and verify the connection.
 */
export const caCertificate = instance.certificate

/** Database name */
export const databaseName = database.name

// The instance is created with a privateNetwork block, so this only trips if
// Scaleway ever returns an instance without one, fail with a real error
// before an opaque undefined-property crash can occur.
const privateNetwork = instance.privateNetwork.apply((pn) => {
  if (!pn) throw new Error('database: main-postgres has no private network endpoint')
  return pn
})

/** Private network hostname */
export const host = privateNetwork.hostname

/** Private network IP */
const ip = privateNetwork.ip

/** Private network port (direct) */
const port = privateNetwork.port

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
export function formatPostgresUrl(user: string, pass: string, host: string, port: number | string, database: string): string {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${database}?sslmode=require&uselibpqcompat=true`
}

/**
 * Build a connection string for the private network endpoint.
 */
function buildConnectionString(
  user: pulumi.Output<string>,
  pass: pulumi.Output<string>,
): pulumi.Output<string> {
  return pulumi.all([user, pass, ip, port, database.name]).apply(([u, p, h, pt, db]) => formatPostgresUrl(u, p, h, pt, db))
}

/** Admin connection for migrations, seeds, system jobs (BYPASSRLS). */
export const connectionStringAdmin = buildConnectionString(adminUser.name, adminPassword)

/** Runtime connection for backend API requests (subject to RLS). */
export const connectionStringRuntime = buildConnectionString(runtimeUser.name, runtimePassword)

/**
 * CDC connection for CDC worker (append-only + logical replication).
 *
 * Uses admin credentials because Scaleway only grants the REPLICATION role
 * attribute (required to open a logical replication slot) to users with
 * isAdmin=true.
 */
export const connectionStringCdc = buildConnectionString(adminUser.name, adminPassword)

/**
 * Admin connection over the temporary public endpoint, when enabled.
 * Returns an empty string when `infra:dbPublicEndpoint` is false.
 */
export const connectionStringAdminPublic = pulumi
  .all([adminUser.name, adminPassword, instance.loadBalancer, database.name])
  .apply(([u, p, lb, db]) => {
    if (!dbPublicEndpoint || !lb?.hostname) return ''
    return formatPostgresUrl(u, p, lb.hostname, lb.port, db)
  })
