import type { ProvisionedStore, StoreProvisioner, StoreSecretContribution } from '../../lib/stores'

/** Configuration for an external database reached through an operator-supplied URL. */
export interface DatabaseUrlConfig {
  /** Services that receive the URL in their per-VM `.env.runtime`. */
  services: readonly string[]
  /** Environment variable the consuming service reads. Defaults to `DATABASE_URL`. */
  envVar?: string
  /** Secret Manager container name. Defaults to `database-url`. */
  secretName?: string
  /** Runtime-secret id the contribution registers under. Defaults to `databaseUrl`. */
  id?: string
  /** Human-readable purpose shown in tooling. */
  description?: string
  /** Whether deploy gating treats an unset URL as fatal. Defaults to true. */
  required?: boolean
  /**
   * Optional CA certificate delivered alongside the URL (base64-encoded PEM,
   * kept single-line for the line-based `.env.runtime`). Provide when the
   * external database uses a private CA the client must trust.
   */
  ca?: {
    services?: readonly string[]
    envVar?: string
    secretName?: string
    id?: string
  }
}

/**
 * External database store: provisions nothing and contributes an
 * operator-supplied connection URL (plus an optional CA cert) as runtime
 * secrets. Dialect-agnostic: any URL a client library accepts (Neon, Turso,
 * Supabase, PlanetScale, a self-hosted instance) works, and the release step
 * owns whatever migration tool the app uses.
 */
export function databaseUrl(config: DatabaseUrlConfig): StoreProvisioner {
  return {
    kind: 'database-url',

    provision(): ProvisionedStore {
      return { outputs: {}, secretValues: {} }
    },

    secrets(): StoreSecretContribution[] {
      const contributions: StoreSecretContribution[] = [
        {
          id: config.id ?? 'databaseUrl',
          secretName: config.secretName ?? 'database-url',
          envVar: config.envVar ?? 'DATABASE_URL',
          description: config.description ?? 'External database connection URL (operator-supplied)',
          required: config.required ?? true,
          valueSource: 'operator',
          services: config.services,
        },
      ]
      if (config.ca) {
        contributions.push({
          id: config.ca.id ?? 'databaseSslCa',
          secretName: config.ca.secretName ?? 'database-ssl-ca',
          envVar: config.ca.envVar ?? 'DATABASE_SSL_CA',
          description: 'base64-encoded PEM CA cert for the external database TLS connection (operator-supplied)',
          required: false,
          valueSource: 'operator',
          services: config.ca.services ?? config.services,
        })
      }
      return contributions
    },
  }
}
