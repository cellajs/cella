import { createPrivateKey, createPublicKey, hkdfSync } from 'node:crypto';
import { defineRuntimeSecrets } from '../lib/runtime-secrets';

/**
 * The Yjs relay's public key for the backend's token key material: the Ed25519 seed is HKDF-SHA256 of the material,
 * as `yjsTokenSigningKey` in shared/src/utils/yjs-token.ts derives it (infra never imports the app's packages; the
 * runtime-secrets test pins the two together). Returned as base64url of the raw 32-byte key.
 */
function yjsTokenPublicKey(material: string): string {
  const seed = Buffer.from(hkdfSync('sha256', material, '', 'yjs-token-ed25519', 32));
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
  const { x } = createPublicKey(createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })).export({
    format: 'jwk',
  });
  if (!x) throw new Error('runtime-secrets.config: Ed25519 public key export carried no key bytes');
  return x;
}

/**
 * App-owned mapping from runtime secrets to their consuming services; per-service manifests restrict each VM to the values it needs.
 * The consumer list also places the secret: one folder per consumer set, which only those services' keys read. The
 * backend image checks the same assignment per process mode (backend/src/env-mode-secrets.ts, pinned by the tests).
 * Database DSN and CA secrets are declared by the primary store in config/stores.config.ts and merge ahead of these entries.
 */
export const runtimeSecretsConfig = defineRuntimeSecrets({
  cookieSecret: {
    secretName: 'cookie-secret',
    description: 'Cookie signing secret',
    envVar: 'COOKIE_SECRET',
    required: true,
    valueSource: 'pulumi',
    generation: 'random',
    services: ['backend', 'mcp', 'oauth'],
  },
  unsubscribeSecret: {
    secretName: 'unsubscribe-token-secret',
    description: 'Email unsubscribe token secret',
    envVar: 'UNSUBSCRIBE_SECRET',
    required: true,
    valueSource: 'pulumi',
    generation: 'random',
    services: ['backend', 'mcp'],
  },
  cdcSecret: {
    secretName: 'cdc-secret',
    description: 'CDC authentication secret',
    envVar: 'CDC_SECRET',
    required: true,
    valueSource: 'pulumi',
    generation: 'random',
    // The CDC socket is served by the API process's internal listener only.
    services: ['backend', 'cdc'],
  },
  yjsTokenPrivateKey: {
    secretName: 'yjs-token-private-key',
    description: 'Key material of the Ed25519 key that signs Yjs editor tokens',
    envVar: 'YJS_TOKEN_PRIVATE_KEY',
    required: true,
    valueSource: 'pulumi',
    generation: 'random',
    // Only the API process's token route signs; the relay verifies with the public half.
    services: ['backend'],
  },
  yjsTokenPublicKey: {
    secretName: 'yjs-token-public-key',
    description: 'Public key the Yjs relay verifies editor tokens with; it cannot sign one',
    envVar: 'YJS_TOKEN_PUBLIC_KEY',
    required: true,
    valueSource: 'pulumi',
    generation: 'manual',
    services: ['yjs'],
    derivedFrom: { secretId: 'yjsTokenPrivateKey', derive: yjsTokenPublicKey },
  },
  yjsRelaySecret: {
    secretName: 'yjs-relay-secret',
    description: "Authenticates the Yjs relay on the backend's internal materialize route",
    envVar: 'YJS_RELAY_SECRET',
    required: true,
    valueSource: 'pulumi',
    generation: 'random',
    services: ['backend', 'yjs'],
  },
  piiHashSecret: {
    secretName: 'pii-hash-secret',
    description: 'HMAC pepper for hashing PII-derived identifiers',
    envVar: 'PII_HASH_SECRET',
    required: true,
    valueSource: 'pulumi',
    generation: 'random',
    services: ['backend', 'mcp'],
  },
  dataEncryptionKey: {
    secretName: 'data-encryption-key',
    description: 'Root key for reversible encryption of sensitive database fields',
    envVar: 'DATA_ENCRYPTION_KEY',
    required: true,
    valueSource: 'pulumi',
    generation: 'random',
    services: ['backend', 'mcp', 'oauth'],
  },
  adminEmail: {
    secretName: 'admin-email',
    description: 'Primary administrative contact email',
    envVar: 'ADMIN_EMAIL',
    required: true,
    valueSource: 'operator',
    generation: 'manual',
    // Read by the admin seed, which the backend's release companion runs.
    services: ['backend'],
  },
  brevoApiKey: {
    secretName: 'brevo-api-key',
    description: 'Brevo transactional email API key',
    envVar: 'BREVO_API_KEY',
    required: false,
    valueSource: 'operator',
    generation: 'manual',
    services: ['backend', 'mcp'],
  },
  scwAiApiKey: {
    secretName: 'scw-ai-api-key',
    description: 'Scaleway AI API key for the MCP worker',
    envVar: 'SCW_AI_API_KEY',
    required: false,
    valueSource: 'operator',
    generation: 'manual',
    services: ['backend', 'mcp'],
  },
  mapleSecretIngestKey: {
    secretName: 'maple-secret-ingest-key',
    description: 'Maple.dev observability secret ingest key (server-side traces, metrics, logs)',
    envVar: 'MAPLE_SECRET_INGEST_KEY',
    required: false,
    valueSource: 'operator',
    generation: 'manual',
    services: ['backend', 'cdc', 'yjs'],
  },
  githubClientId: {
    secretName: 'github-client-id',
    description: 'GitHub OAuth client ID',
    envVar: 'GITHUB_CLIENT_ID',
    required: false,
    valueSource: 'operator',
    generation: 'manual',
    services: ['backend', 'mcp'],
  },
  githubClientSecret: {
    secretName: 'github-client-secret',
    description: 'GitHub OAuth client secret',
    envVar: 'GITHUB_CLIENT_SECRET',
    required: false,
    valueSource: 'operator',
    generation: 'manual',
    services: ['backend', 'mcp'],
  },
  systemAdminIpAllowlist: {
    secretName: 'system-admin-ip-allowlist',
    description: "System admin IP allowlist ('none' to disable, '*' for any IP, or comma-separated IPv4 addresses)",
    envVar: 'SYSTEM_ADMIN_IP_ALLOWLIST',
    required: false,
    valueSource: 'operator',
    generation: 'manual',
    services: ['backend', 'mcp'],
  },
});
