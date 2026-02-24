# Key Management

This document covers RSA key pair management for cryptographic operations in Cella, including LTI, webhooks, and other signed payloads.

## Overview

Cella automatically generates and manages RSA key pairs for:
- **LTI 1.3**: Signing id_tokens when launching tools, verifying incoming launches
- **Webhooks** (future): Signing outgoing webhook payloads
- **API signatures** (future): Signed API responses

Keys are stored in the database, encrypted at rest, with automatic rotation.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Key Management Service                       │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  Key Generator  │  │  Key Rotator    │  │  Encryption Service │  │
│  │                 │  │  (background)   │  │                     │  │
│  │  - RSA 2048     │  │  - Deprecate    │  │  - AES-256-GCM      │  │
│  │  - Auto on init │  │  - Remove       │  │  - Env master key   │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘  │
│           │                    │                      │             │
│           └────────────────────┼──────────────────────┘             │
│                                ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Database (signing_keys)                    │   │
│  │                                                                │   │
│  │  - Public key (PEM)                                           │   │
│  │  - Private key (encrypted PEM)                                │   │
│  │  - Purpose tag (lti, webhook, etc.)                           │   │
│  │  - Lifecycle status                                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                │                                     │
│                                ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    JWKS Endpoint                              │   │
│  │                                                                │   │
│  │  GET /.well-known/jwks.json (all purposes)                   │   │
│  │  GET /.well-known/jwks.json?use=lti (filtered)               │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Private Key Encryption

Private keys are **encrypted at rest** using AES-256-GCM with a master key from environment.

### Environment Variable

```bash
# .env
# Generate with: openssl rand -base64 32
SIGNING_KEY_SECRET=your-32-byte-base64-encoded-secret
```

### Encryption Implementation

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  const secret = process.env.SIGNING_KEY_SECRET
  if (!secret) {
    throw new Error('SIGNING_KEY_SECRET environment variable is required')
  }
  return Buffer.from(secret, 'base64')
}

export function encryptPrivateKey(privateKey: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  
  const cipher = createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(privateKey, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  
  const authTag = cipher.getAuthTag()
  
  // Format: iv:authTag:encryptedData (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
}

export function decryptPrivateKey(encryptedData: string): string {
  const key = getEncryptionKey()
  const [ivB64, authTagB64, encrypted] = encryptedData.split(':')
  
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')
  
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(encrypted, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}
```

## Database Schema

```typescript
export const signingKeys = pgTable('signing_keys', {
  id: varchar('id', { length: nanoidLength }).primaryKey(),
  
  // Key material
  publicKey: text('public_key').notNull(),           // PEM format (plaintext)
  privateKey: text('private_key').notNull(),         // PEM format (encrypted)
  algorithm: varchar('algorithm', { length: 16 }).default('RS256'),
  
  // Purpose tagging
  purpose: varchar('purpose', { length: 32 }).notNull(),  // 'lti', 'webhook', 'api', etc.
  
  // Key lifecycle
  status: varchar('status', { length: 16 }).default('active'),  // 'active' | 'deprecated' | 'revoked'
  isPrimary: boolean('is_primary').default(false),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  activeUntil: timestamp('active_until'),       // When key should be deprecated
  deprecatedAt: timestamp('deprecated_at'),     // When deprecation started
  removeAfter: timestamp('remove_after'),       // When to fully remove
  revokedAt: timestamp('revoked_at'),           // Manual revocation timestamp
}, (table) => [
  index('signing_keys_purpose_status_idx').on(table.purpose, table.status),
]);
```

## Key Lifecycle

```
┌──────────┐     activeUntil      ┌────────────┐    removeAfter      ┌─────────┐
│  ACTIVE  │ ──────────────────> │ DEPRECATED │ ─────────────────> │ REMOVED │
│          │                      │            │                     │         │
│ Signs &  │                      │ Verifies   │                     │ Deleted │
│ Verifies │                      │ only       │                     │ from DB │
└──────────┘                      └────────────┘                     └─────────┘
      │
      │ revokedAt (manual)
      ▼
┌──────────┐
│ REVOKED  │  Immediate removal from JWKS
└──────────┘
```

### Recommended TTLs

| Setting | Default | Description |
|---------|---------|-------------|
| `KEY_ACTIVE_DAYS` | 30 | How long a key stays active |
| `KEY_GRACE_DAYS` | 7 | How long deprecated keys remain in JWKS |
| `MIN_ACTIVE_KEYS` | 2 | Minimum active keys per purpose |

### Why these values?

- **30 days active**: Balance between security (rotate frequently) and stability (not too often)
- **7 days grace**: External systems cache JWKS (typically 24h), 7 days is very safe
- **2 minimum keys**: Always have a backup, enables seamless rotation

## Key Generation

```typescript
import { generateKeyPairSync } from 'node:crypto'

interface KeyGenerationOptions {
  purpose: 'lti' | 'webhook' | 'api'
  makePrimary?: boolean
  activeDays?: number
}

async function generateSigningKey(options: KeyGenerationOptions) {
  const { purpose, makePrimary = false, activeDays = 30 } = options
  
  // Generate RSA key pair
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  
  // Encrypt private key before storage
  const encryptedPrivateKey = encryptPrivateKey(privateKey)
  
  const activeUntil = new Date()
  activeUntil.setDate(activeUntil.getDate() + activeDays)
  
  const keyId = nanoid()
  
  await db.insert(signingKeys).values({
    id: keyId,
    publicKey,
    privateKey: encryptedPrivateKey,
    purpose,
    status: 'active',
    isPrimary: makePrimary,
    activeUntil,
  })
  
  return keyId
}
```

## Initialization on Startup

```typescript
async function initializeSigningKeys() {
  const purposes: Array<'lti' | 'webhook' | 'api'> = ['lti']  // Add more as needed
  
  for (const purpose of purposes) {
    const activeKeys = await db.query.signingKeys.findMany({
      where: and(
        eq(signingKeys.purpose, purpose),
        eq(signingKeys.status, 'active')
      )
    })
    
    // Ensure minimum keys exist
    const keysNeeded = Math.max(0, 2 - activeKeys.length)
    for (let i = 0; i < keysNeeded; i++) {
      await generateSigningKey({ purpose })
    }
    
    // Ensure one primary key
    await ensurePrimaryKey(purpose)
  }
  
  console.log('Signing keys initialized')
}

async function ensurePrimaryKey(purpose: string) {
  const primary = await db.query.signingKeys.findFirst({
    where: and(
      eq(signingKeys.purpose, purpose),
      eq(signingKeys.status, 'active'),
      eq(signingKeys.isPrimary, true)
    )
  })
  
  if (!primary) {
    // Promote newest active key
    const newest = await db.query.signingKeys.findFirst({
      where: and(
        eq(signingKeys.purpose, purpose),
        eq(signingKeys.status, 'active')
      ),
      orderBy: desc(signingKeys.createdAt)
    })
    
    if (newest) {
      await db.update(signingKeys)
        .set({ isPrimary: true })
        .where(eq(signingKeys.id, newest.id))
    }
  }
}
```

## Automatic Key Rotation

Background job (run every hour via cron or scheduled task):

```typescript
async function rotateSigningKeys() {
  const now = new Date()
  
  // 1. Deprecate expired active keys
  const expiredKeys = await db.query.signingKeys.findMany({
    where: and(
      eq(signingKeys.status, 'active'),
      lt(signingKeys.activeUntil, now)
    )
  })
  
  for (const key of expiredKeys) {
    const removeAfter = new Date(now)
    removeAfter.setDate(removeAfter.getDate() + 7)  // 7-day grace period
    
    await db.update(signingKeys)
      .set({
        status: 'deprecated',
        deprecatedAt: now,
        removeAfter,
        isPrimary: false,  // Can't be primary if deprecated
      })
      .where(eq(signingKeys.id, key.id))
  }
  
  // 2. Remove keys past grace period
  await db.delete(signingKeys)
    .where(and(
      eq(signingKeys.status, 'deprecated'),
      lt(signingKeys.removeAfter, now)
    ))
  
  // 3. Remove revoked keys (immediate, but give 1 hour for in-flight requests)
  await db.delete(signingKeys)
    .where(and(
      eq(signingKeys.status, 'revoked'),
      lt(signingKeys.revokedAt, new Date(now.getTime() - 60 * 60 * 1000))
    ))
  
  // 4. Ensure minimum keys per purpose
  const purposes = await db.selectDistinct({ purpose: signingKeys.purpose })
    .from(signingKeys)
  
  for (const { purpose } of purposes) {
    const activeCount = await db.select({ count: count() })
      .from(signingKeys)
      .where(and(
        eq(signingKeys.purpose, purpose),
        eq(signingKeys.status, 'active')
      ))
    
    if (activeCount[0].count < 2) {
      await generateSigningKey({ purpose: purpose as 'lti' | 'webhook' | 'api' })
    }
    
    await ensurePrimaryKey(purpose)
  }
}
```

## JWKS Endpoint

### Single Shared Endpoint (Recommended)

One endpoint serves all keys, optionally filtered by purpose:

```typescript
// GET /.well-known/jwks.json
// GET /.well-known/jwks.json?use=lti
app.get('/.well-known/jwks.json', async (ctx) => {
  const purposeFilter = ctx.req.query('use')
  
  const whereConditions = [
    inArray(signingKeys.status, ['active', 'deprecated']),
    isNull(signingKeys.revokedAt),
  ]
  
  if (purposeFilter) {
    whereConditions.push(eq(signingKeys.purpose, purposeFilter))
  }
  
  const keys = await db.query.signingKeys.findMany({
    where: and(...whereConditions)
  })
  
  return ctx.json({
    keys: keys.map(key => ({
      kty: 'RSA',
      alg: key.algorithm || 'RS256',
      use: 'sig',
      kid: key.id,
      // Include purpose in key metadata (non-standard but useful)
      purpose: key.purpose,
      ...extractJwkComponents(key.publicKey),
    }))
  })
})

function extractJwkComponents(publicKeyPem: string) {
  // Use jose or crypto to extract n and e from PEM
  const keyObject = createPublicKey(publicKeyPem)
  const jwk = keyObject.export({ format: 'jwk' })
  return { n: jwk.n, e: jwk.e }
}
```

### Why One Endpoint?

| Approach | Pros | Cons |
|----------|------|------|
| **Shared endpoint** | Simpler, DRY, easy to manage | Keys from all purposes mixed |
| **Dedicated endpoints** | Clear separation | More endpoints, more code |

**Recommendation**: Use shared endpoint with `?use=` filter. LTI spec doesn't require a specific path - you just configure the JWKS URL when registering with platforms/tools.

Example configurations:
- **LTI registration**: `https://cella.example.com/.well-known/jwks.json?use=lti`
- **Webhook verification**: `https://cella.example.com/.well-known/jwks.json?use=webhook`

## Getting Keys for Signing

```typescript
async function getPrimarySigningKey(purpose: string): Promise<{ id: string; privateKey: string }> {
  const key = await db.query.signingKeys.findFirst({
    where: and(
      eq(signingKeys.purpose, purpose),
      eq(signingKeys.status, 'active'),
      eq(signingKeys.isPrimary, true)
    )
  })
  
  if (!key) {
    throw new Error(`No active primary key for purpose: ${purpose}`)
  }
  
  return {
    id: key.id,
    privateKey: decryptPrivateKey(key.privateKey),
  }
}

// Usage in LTI
async function signLtiToken(claims: LtiClaims): Promise<string> {
  const { id, privateKey } = await getPrimarySigningKey('lti')
  
  return jwt.sign(claims, privateKey, {
    algorithm: 'RS256',
    keyid: id,
  })
}
```

## Admin API

```typescript
// List keys
GET /api/admin/signing-keys
GET /api/admin/signing-keys?purpose=lti

// Generate new key
POST /api/admin/signing-keys
Body: { purpose: 'lti', makePrimary?: boolean }

// Set as primary
POST /api/admin/signing-keys/:id/primary

// Deprecate key (starts grace period)
POST /api/admin/signing-keys/:id/deprecate

// Revoke key (emergency - immediate removal)
POST /api/admin/signing-keys/:id/revoke

// Delete key (only if already deprecated/revoked)
DELETE /api/admin/signing-keys/:id
```

## File Structure

```
backend/src/lib/signing-keys/
├── index.ts                    # Public exports
├── types.ts                    # Types and interfaces
├── encryption.ts               # Private key encryption/decryption
├── generator.ts                # Key pair generation
├── rotator.ts                  # Automatic rotation logic
├── service.ts                  # Main service (get keys, sign, etc.)
└── routes.ts                   # Admin API routes

backend/src/modules/lti/
├── ...
└── (references lib/signing-keys for key operations)
```

## Security Considerations

1. **Master key rotation**: If `SIGNING_KEY_SECRET` needs to change:
   - Generate new secret
   - Re-encrypt all private keys with new secret
   - Deploy with new secret
   - (Can be done with a migration script)

2. **Key exposure**: If a private key is compromised:
   - Immediately revoke via admin API
   - System auto-generates new key
   - Monitor for suspicious token usage

3. **Backup**: 
   - Database backups include encrypted keys
   - Keep `SIGNING_KEY_SECRET` in secure secret manager
   - Without the secret, backed-up keys are useless (good!)

## Configuration

```typescript
// config/keys.ts
export const keyConfig = {
  // How long keys stay active
  activeLifetimeDays: Number(process.env.KEY_ACTIVE_DAYS) || 30,
  
  // Grace period after deprecation
  gracePeriodDays: Number(process.env.KEY_GRACE_DAYS) || 7,
  
  // Minimum active keys per purpose
  minActiveKeys: Number(process.env.MIN_ACTIVE_KEYS) || 2,
  
  // RSA key size
  modulusLength: 2048,
  
  // Algorithm for signing
  algorithm: 'RS256' as const,
}
```

## Related Documentation

- [LTI Integration](./LTI.md) - Uses signing keys for JWT operations
- [LTI as Consumer](./LTI_AS_CONSUMER.md) - Signs id_tokens for tool launches
- [LTI as Tool](./LTI_AS_TOOL.md) - Serves JWKS for platform verification
