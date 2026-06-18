import { type PeerCertificate, checkServerIdentity as tlsCheckServerIdentity } from 'node:tls';
import type { DrizzleConfig } from 'drizzle-orm';
import { type NodePgClient, type NodePgDatabase, drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import { env } from '../env';

export const dbConfig = {
  logger: !!env.DEBUG,
} satisfies DrizzleConfig;

export const migrateConfig = { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle-backend' };

export type PgDB = NodePgDatabase & { $client: NodePgClient };
export type DB = PgDB;

type TxOf<D extends { transaction: (...args: never[]) => unknown }> = Parameters<Parameters<D['transaction']>[0]>[0];

export type Tx = TxOf<DB>;
export type DbOrTx = DB | Tx;

// In production we require a verified TLS connection to the managed PostgreSQL.
// The CA (Scaleway RDB instance cert) is provisioned automatically into the
// DATABASE_SSL_CA runtime secret by `pulumi up`, so a missing value is a
// misconfiguration we fail fast on rather than silently downgrading security.
// The secret is base64-encoded (the PEM is multi-line and would break the
// line-based `.env.runtime` delivery), so decode it back to PEM here.
const sslConfig =
  env.NODE_ENV === 'production' && !env.NODB
    ? (() => {
        if (!env.DATABASE_SSL_CA) {
          throw new Error(
            'FATAL: DATABASE_SSL_CA is required in production for verified TLS to PostgreSQL. ' +
              'It is provisioned automatically by `pulumi up` (Scaleway RDB CA). Run the infra ' +
              "CLI → 'Apply infra change', or check the database-ssl-ca runtime secret.",
          );
        }
        return {
          ca: Buffer.from(env.DATABASE_SSL_CA, 'base64').toString('utf-8'),
          rejectUnauthorized: true,
          // Scaleway's managed PostgreSQL presents a self-signed, per-instance
          // certificate whose CN is the private endpoint host (e.g. an IP like
          // 10.0.0.2) with no subjectAltName. We connect by that same private
          // IP, but Node's default identity check only matches IP literals
          // against `iPAddress` SAN entries — it ignores the CN — so it would
          // reject the connection ("IP is not in the cert's altnames") even
          // though we pin the exact CA. Authentication is already guaranteed by
          // `rejectUnauthorized` verifying the chain against that pinned CA; we
          // additionally assert the presented cert's CN equals the host we
          // dialed, then fall back to Node's default check for anything else.
          checkServerIdentity: (host: string, cert: PeerCertificate) => {
            if (cert.subject?.CN === host) return undefined;
            return tlsCheckServerIdentity(host, cert);
          },
        };
      })()
    : undefined;

// Scaleway-built connection strings pin `sslmode=require&uselibpqcompat=true`,
// which pg would let override the verified `ssl` config above (downgrading to
// rejectUnauthorized:false). Strip those params so our CA-pinned config wins.
const toConnectionString = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('uselibpqcompat');
    return parsed.toString();
  } catch {
    return url;
  }
};

const createPgConnection = (connectionString: string, max: number): PgDB =>
  pgDrizzle({
    connection: {
      connectionString: toConnectionString(connectionString),
      connectionTimeoutMillis: 10_000,
      max,
      ssl: sslConfig,
    },
    ...dbConfig,
  });

const initConnections = (): { db: DB; migrationDb?: PgDB; adminDb?: PgDB } => {
  if (env.NODB) {
    return { db: {} as unknown as DB };
  }

  return {
    db: createPgConnection(env.DATABASE_URL, env.DATABASE_POOL_MAX),
    migrationDb: createPgConnection(env.DATABASE_ADMIN_URL, 5),
    adminDb: createPgConnection(env.DATABASE_ADMIN_URL, 5),
  };
};

const connections = initConnections();

export const baseDb: DB = connections.db;
export const migrationDb: PgDB | undefined = connections.migrationDb;
export const unsafeInternalAdminDb: PgDB | undefined = connections.adminDb;

/** Admin connection for seed scripts */
export const seedDb: DB = (connections.adminDb ?? connections.db) as DB;
