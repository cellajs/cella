/**
 * Secrets — mirror of all runtime secrets into Scaleway Secret Manager.
 *
 * Compute VMs currently consume secrets directly from cloud-init userdata (see the
 * compute module's known limitation), so these Secret/SecretVersion pairs act as
 * the canonical, rotateable, audit-logged store and a recovery source. Each secret
 * is namespaced under `/{slug}-{mode}/` so multiple stacks can share a project.
 *
 * Stack config secrets: infra:cookieSecret, infra:unsubscribeSecret,
 *                       infra:cdcSecret, infra:yjsSecret, infra:scwAiApiKey
 */
import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { naming, region, tags, mode, infraConfig } from '../helpers'
import { connectionStringAdmin, connectionStringRuntime, connectionStringCdc } from './database'

// Application secrets from stack config
const cookieSecret = infraConfig.requireSecret('cookieSecret')
const unsubscribeSecret = infraConfig.requireSecret('unsubscribeSecret')
const cdcSecret = infraConfig.requireSecret('cdcSecret')
const yjsSecret = infraConfig.requireSecret('yjsSecret')
const brevoApiKey = infraConfig.requireSecret('brevoApiKey')
const scwAiApiKey = infraConfig.requireSecret('scwAiApiKey')

/** Folder path for secret organization, e.g. '/cella-production/' */
const secretPath = `/${naming.slug}-${mode}/`

// ---------------------------------------------------------------------------
// Helper — create a Secret + SecretVersion pair
// ---------------------------------------------------------------------------

function createSecret(
  name: string,
  description: string,
  data: pulumi.Input<string>,
) {
  const secret = new scaleway.secrets.Secret(`secret-${name}`, {
    name,
    path: secretPath,
    description,
    region,
    tags,
  }, { aliases: [{ type: 'scaleway:index/secret:Secret' }] })

  new scaleway.secrets.Version(`secret-version-${name}`, {
    secretId: secret.id,
    data,
    region,
  }, { aliases: [{ type: 'scaleway:index/secretVersion:SecretVersion' }] })

  return secret
}

// ---------------------------------------------------------------------------
// Database URL secrets
// ---------------------------------------------------------------------------

const dbUrlAdminSecret = createSecret(
  'database-url-admin',
  'PostgreSQL admin_role connection string (migrations, seeds, BYPASSRLS)',
  connectionStringAdmin,
)

const dbUrlRuntimeSecret = createSecret(
  'database-url-runtime',
  'PostgreSQL runtime_role connection string (backend API, subject to RLS)',
  connectionStringRuntime,
)

const dbUrlCdcSecret = createSecret(
  'database-url-cdc',
  'PostgreSQL cdc_role connection string (CDC worker, append-only + replication)',
  connectionStringCdc,
)

// ---------------------------------------------------------------------------
// Application secrets
// ---------------------------------------------------------------------------

const cookieSecretRes = createSecret(
  'cookie-secret',
  'Cookie signing secret',
  cookieSecret,
)

const unsubscribeSecretRes = createSecret(
  'unsubscribe-token-secret',
  'Email unsubscribe token secret',
  unsubscribeSecret,
)

const cdcSecretRes = createSecret(
  'cdc-secret',
  'CDC authentication secret',
  cdcSecret,
)

const yjsSecretRes = createSecret(
  'yjs-secret',
  'Yjs WebSocket authentication secret',
  yjsSecret,
)

const brevoApiKeyRes = createSecret(
  'brevo-api-key',
  'Brevo transactional email API key',
  brevoApiKey,
)

const scwAiApiKeyRes = createSecret(
  'scw-ai-api-key',
  'Scaleway AI API key for the AI worker',
  scwAiApiKey,
)

// ---------------------------------------------------------------------------
// Exports — secret IDs for container references
// ---------------------------------------------------------------------------

/** Map of secret names to their Scaleway Secret IDs */
export const secretIds = {
  databaseUrlAdmin: dbUrlAdminSecret.id,
  databaseUrlRuntime: dbUrlRuntimeSecret.id,
  databaseUrlCdc: dbUrlCdcSecret.id,
  cookieSecret: cookieSecretRes.id,
  unsubscribeSecret: unsubscribeSecretRes.id,
  cdcSecret: cdcSecretRes.id,
  yjsSecret: yjsSecretRes.id,
  brevoApiKey: brevoApiKeyRes.id,
  scwAiApiKey: scwAiApiKeyRes.id,
}
