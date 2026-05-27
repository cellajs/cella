/**
 * Database — Managed PostgreSQL 17 reachable only via the main private network.
 *
 * Three role-based users (admin, runtime, cdc) get distinct passwords so app
 * traffic, migrations and CDC replication can be audited and rotated independently.
 * HA replica and automated backups are enabled outside dev mode. Passwords come
 * from stack-config secrets when set, otherwise generated and stored in state.
 *
 * Config consumed from appConfig: slug (via naming), mode (HA/backup logic)
 * Stack config: infra:dbNodeType, infra:dbVolumeSize
 */
import * as pulumi from '@pulumi/pulumi'
import * as random from '@pulumi/random'
import * as scaleway from '@pulumiverse/scaleway'
import { naming, region, infraConfig, infra, isProduction } from '../helpers'
import { privateNetworkId } from './network'

const dbNodeType = infra.dbNodeType
const dbVolumeSize = infra.dbVolumeSize

/** Database name derived from slug (e.g. 'cella') */
const dbSlug = naming.slug.replace(/-/g, '_') // PostgreSQL identifiers can't have hyphens

// ---------------------------------------------------------------------------
// Passwords — one per role, each from stack config secret or generated
// ---------------------------------------------------------------------------

function rolePassword(name: string): pulumi.Output<string> {
  const configured = infraConfig.getSecret(`${name}Password`)
  if (configured) return configured
  return new random.RandomPassword(`${name}-password`, {
    length: 32,
    special: true,
    overrideSpecial: '-_.~', // URL-safe special chars (RFC 3986 unreserved)
    minLower: 2,
    minUpper: 2,
    minNumeric: 2,
    minSpecial: 2,
  }).result
}

const adminPassword = rolePassword('admin')
const runtimePassword = rolePassword('runtime')
const cdcPassword = rolePassword('cdc')

// Temporary public endpoint for operator tasks (e.g. one-off data migrations).
// `infra:dbPublicEndpoint=true` attaches a public LB endpoint to the instance.
// `infra:dbPublicAcl` is a comma-separated list of CIDRs allowed to connect.
// Both should be unset once the task is done so the DB returns to private-only.
const dbPublicEndpoint = infraConfig.getBoolean('dbPublicEndpoint') ?? false
const dbPublicAcl = infraConfig.get('dbPublicAcl') ?? ''

// ---------------------------------------------------------------------------
// PostgreSQL Instance
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const database = new scaleway.databases.Database('main-database', {
  instanceId: instance.id,
  name: dbSlug,
  region,
}, { aliases: [{ type: 'scaleway:index/database:Database' }] })

// ---------------------------------------------------------------------------
// Users — one per role, matching the PostgreSQL roles used by the application.
// admin_role: migrations, seeds, system jobs (isAdmin for BYPASSRLS)
// runtime_role: authenticated app requests, subject to RLS
// cdc_role: CDC worker, append-only activities + logical replication
// ---------------------------------------------------------------------------

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

const cdcUser = new scaleway.databases.User('cdc-user', {
  instanceId: instance.id,
  name: 'cdc_role',
  password: cdcPassword,
  isAdmin: false,
  region,
})

// ---------------------------------------------------------------------------
// Privileges — each role gets 'all' on the database (fine-grained table
// permissions are enforced by the RLS migration, not Scaleway-level grants)
// ---------------------------------------------------------------------------

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

new scaleway.databases.Privilege('cdc-privilege', {
  instanceId: instance.id,
  databaseName: database.name,
  userName: cdcUser.name,
  permission: 'all',
  region,
})

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** Database instance ID */
export const instanceId = instance.id

/** Database name */
export const databaseName = database.name

/** Private network hostname */
export const host = instance.privateNetwork.apply((pn) => pn!.hostname)

/** Private network IP */
export const ip = instance.privateNetwork.apply((pn) => pn!.ip)

/** Private network port (direct) */
export const port = instance.privateNetwork.apply((pn) => pn!.port)

/**
 * Build a connection string for the private network endpoint.
 * Scaleway private endpoints use self-signed certs, so we use
 * `uselibpqcompat=true` to make sslmode=require behave like libpq
 * (encrypt without certificate verification).
 */
function buildConnectionString(
  user: pulumi.Output<string>,
  pass: pulumi.Output<string>,
): pulumi.Output<string> {
  return pulumi.all([user, pass, ip, port, database.name]).apply(
    ([u, p, h, pt, db]) =>
      `postgresql://${encodeURIComponent(u)}:${encodeURIComponent(p)}@${h}:${pt}/${db}?sslmode=require&uselibpqcompat=true`,
  )
}

/** Admin connection — for migrations, seeds, system jobs (BYPASSRLS) */
export const connectionStringAdmin = buildConnectionString(adminUser.name, adminPassword)

/** Runtime connection — for backend API requests (subject to RLS) */
export const connectionStringRuntime = buildConnectionString(runtimeUser.name, runtimePassword)

/** CDC connection — for CDC worker (append-only + logical replication) */
export const connectionStringCdc = buildConnectionString(cdcUser.name, cdcPassword)

/**
 * Admin connection over the temporary public endpoint, when enabled.
 * Returns an empty string when `infra:dbPublicEndpoint` is false.
 */
export const connectionStringAdminPublic = pulumi
  .all([adminUser.name, adminPassword, instance.loadBalancer, database.name])
  .apply(([u, p, lb, db]) => {
    if (!dbPublicEndpoint || !lb?.hostname) return ''
    return `postgresql://${encodeURIComponent(u)}:${encodeURIComponent(p)}@${lb.hostname}:${lb.port}/${db}?sslmode=require&uselibpqcompat=true`
  })
