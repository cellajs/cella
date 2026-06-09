export const runtimeSecretConsumers = ['backend', 'cdc', 'yjs', 'ai', 'frontend'] as const

export type RuntimeSecretConsumer = (typeof runtimeSecretConsumers)[number]

export type RuntimeSecretValueSource = 'pulumi' | 'operator'
export type RuntimeSecretGeneration = 'manual' | 'random'

export interface RuntimeSecretDefinition {
  id: string
  secretName: string
  description: string
  envVar: string
  legacyStackConfigKey?: string
  required: boolean
  valueSource: RuntimeSecretValueSource
  generation: RuntimeSecretGeneration
  services: RuntimeSecretConsumer[]
}

export const runtimeSecrets = [
  {
    id: 'databaseUrlRuntime',
    secretName: 'database-url-runtime',
    description: 'PostgreSQL runtime_role connection string (backend API, subject to RLS)',
    envVar: 'DATABASE_URL',
    required: true,
    valueSource: 'pulumi',
    generation: 'manual',
    services: ['backend', 'yjs', 'ai'],
  },
  {
    id: 'databaseUrlAdmin',
    secretName: 'database-url-admin',
    description: 'PostgreSQL admin_role connection string (migrations, seeds, BYPASSRLS)',
    envVar: 'DATABASE_ADMIN_URL',
    required: true,
    valueSource: 'pulumi',
    generation: 'manual',
    services: ['backend', 'ai'],
  },
  {
    id: 'databaseUrlCdc',
    secretName: 'database-url-cdc',
    description: 'PostgreSQL CDC worker connection string (admin_role with replication access)',
    envVar: 'DATABASE_CDC_URL',
    required: true,
    valueSource: 'pulumi',
    generation: 'manual',
    services: ['cdc'],
  },
  {
    id: 'cookieSecret',
    secretName: 'cookie-secret',
    description: 'Cookie signing secret',
    envVar: 'COOKIE_SECRET',
    legacyStackConfigKey: 'infra:cookieSecret',
    required: true,
    valueSource: 'pulumi',
    generation: 'random',
    services: ['backend', 'ai'],
  },
  {
    id: 'unsubscribeSecret',
    secretName: 'unsubscribe-token-secret',
    description: 'Email unsubscribe token secret',
    envVar: 'UNSUBSCRIBE_SECRET',
    legacyStackConfigKey: 'infra:unsubscribeSecret',
    required: true,
    valueSource: 'pulumi',
    generation: 'random',
    services: ['backend', 'ai'],
  },
  {
    id: 'cdcSecret',
    secretName: 'cdc-secret',
    description: 'CDC authentication secret',
    envVar: 'CDC_SECRET',
    legacyStackConfigKey: 'infra:cdcSecret',
    required: true,
    valueSource: 'pulumi',
    generation: 'random',
    services: ['backend', 'cdc', 'ai'],
  },
  {
    id: 'yjsSecret',
    secretName: 'yjs-secret',
    description: 'Yjs WebSocket authentication secret',
    envVar: 'YJS_SECRET',
    legacyStackConfigKey: 'infra:yjsSecret',
    required: true,
    valueSource: 'pulumi',
    generation: 'random',
    services: ['backend', 'yjs', 'ai'],
  },
  {
    id: 'piiHashSecret',
    secretName: 'pii-hash-secret',
    description: 'HMAC pepper for hashing PII-derived identifiers',
    envVar: 'PII_HASH_SECRET',
    legacyStackConfigKey: 'infra:piiHashSecret',
    required: true,
    valueSource: 'pulumi',
    generation: 'random',
    services: ['backend', 'ai'],
  },
  {
    id: 'adminEmail',
    secretName: 'admin-email',
    description: 'Primary administrative contact email',
    envVar: 'ADMIN_EMAIL',
    legacyStackConfigKey: 'infra:adminEmail',
    required: true,
    valueSource: 'operator',
    generation: 'manual',
    services: ['backend', 'ai'],
  },
  {
    id: 'brevoApiKey',
    secretName: 'brevo-api-key',
    description: 'Brevo transactional email API key',
    envVar: 'BREVO_API_KEY',
    legacyStackConfigKey: 'infra:brevoApiKey',
    required: false,
    valueSource: 'operator',
    generation: 'manual',
    services: ['backend', 'ai'],
  },
  {
    id: 'scwAiApiKey',
    secretName: 'scw-ai-api-key',
    description: 'Scaleway AI API key for the AI worker',
    envVar: 'SCW_AI_API_KEY',
    legacyStackConfigKey: 'infra:scwAiApiKey',
    required: false,
    valueSource: 'operator',
    generation: 'manual',
    services: ['backend', 'ai'],
  },
  {
    id: 'githubClientId',
    secretName: 'github-client-id',
    description: 'GitHub OAuth client ID',
    envVar: 'GITHUB_CLIENT_ID',
    required: false,
    valueSource: 'operator',
    generation: 'manual',
    services: ['backend', 'ai'],
  },
  {
    id: 'githubClientSecret',
    secretName: 'github-client-secret',
    description: 'GitHub OAuth client secret',
    envVar: 'GITHUB_CLIENT_SECRET',
    required: false,
    valueSource: 'operator',
    generation: 'manual',
    services: ['backend', 'ai'],
  },
] as const satisfies readonly RuntimeSecretDefinition[]

export const runtimeSecretsById = new Map<string, RuntimeSecretDefinition>(runtimeSecrets.map((secret) => [secret.id, secret]))
export const runtimeSecretsByEnvVar = new Map<string, RuntimeSecretDefinition>(runtimeSecrets.map((secret) => [secret.envVar, secret]))
export const operatorManagedRuntimeSecrets: RuntimeSecretDefinition[] = runtimeSecrets.filter((secret) => secret.valueSource === 'operator')

export function runtimeSecretsForConsumer(consumer: RuntimeSecretConsumer): RuntimeSecretDefinition[] {
  return runtimeSecrets.filter((secret) => secret.services.some((service) => service === consumer))
}