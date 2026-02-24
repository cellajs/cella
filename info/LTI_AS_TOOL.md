# Cella as LTI Tool (Provider)

This document covers the implementation of Cella being **launched from external platforms** like Canvas, Moodle, or Blackboard.

**Use case**: A university uses Canvas as their LMS. Students click an assignment link in Canvas and are seamlessly launched into Cella with their identity and context preserved.

See also: [LTI.md](./LTI.md) (general overview) | [LTI_AS_CONSUMER.md](./LTI_AS_CONSUMER.md) (launching external tools)

## Overview

```
┌──────────────────────────────────────┐
│  External Platform (Canvas, Moodle)  │
│                                      │
│  Student clicks "Open in Cella" →    │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│           Cella (Tool)               │
│                                      │
│  - Receives launch request           │
│  - Validates JWT from platform       │
│  - Creates/links user                │
│  - Establishes session               │
└──────────────────────────────────────┘
```

## Launch Flow

```
Platform                          Cella (Tool)                    User
    │                                  │                            │
    │  1. POST /lti/login              │                            │
    │  (iss, login_hint, target_link)  │                            │
    │─────────────────────────────────>│                            │
    │                                  │                            │
    │  2. Redirect to platform auth    │                            │
    │  (state, nonce, redirect_uri)    │                            │
    │<─────────────────────────────────│                            │
    │                                  │                            │
    │  3. Platform authenticates user  │                            │
    │                                  │                            │
    │  4. POST /lti/launch             │                            │
    │  (id_token JWT, state)           │                            │
    │─────────────────────────────────>│                            │
    │                                  │                            │
    │                                  │  5. Validate JWT           │
    │                                  │  - Check signature (JWKS)  │
    │                                  │  - Verify nonce/state      │
    │                                  │  - Extract LTI claims      │
    │                                  │                            │
    │                                  │  6. Create/link user       │
    │                                  │  7. Create session         │
    │                                  │                            │
    │                                  │  8. Render app             │
    │                                  │─────────────────────────────>
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/lti/login` | POST | OIDC login initiation (Step 1) |
| `/lti/launch` | POST | Receive id_token and establish session (Step 4) |
| `/.well-known/jwks.json` | GET | Our public keys (for platform to verify our signatures) |

## Architecture

```
backend/src/modules/lti/tool/
├── index.ts
├── login-handler.ts        # Handle OIDC login initiation
├── launch-handler.ts       # Handle id_token, create session
├── jwt-validator.ts        # Validate platform's JWT
├── platform-registry.ts    # Store/retrieve platform configs
├── user-provisioner.ts     # Create/link Cella users from LTI
└── services/
    ├── ags-client.ts       # Call platform's AGS (grade passback)
    ├── nrps-client.ts      # Call platform's NRPS (roster)
    └── deep-linking.ts     # Build Deep Linking responses
```

## Database Schema

### Platform Registration

Stores information about platforms that can launch Cella.

```typescript
// Platforms that can launch Cella as a tool
export const ltiPlatforms = pgTable('lti_platforms', {
  id: varchar('id', { length: nanoidLength }).primaryKey(),
  
  // Platform identification
  issuer: varchar('issuer', { length: 512 }).notNull(),        // Platform's issuer URL
  clientId: varchar('client_id', { length: 256 }).notNull(),   // Our client_id on platform
  
  // Platform endpoints
  authorizationUrl: varchar('authorization_url', { length: 512 }).notNull(),
  tokenUrl: varchar('token_url', { length: 512 }).notNull(),
  jwksUrl: varchar('jwks_url', { length: 512 }).notNull(),
  
  // Optional: restrict to specific organization
  organizationId: varchar('organization_id', { length: nanoidLength })
    .references(() => organizations.id),
  
  // Metadata
  name: varchar('name', { length: 256 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('lti_platforms_issuer_client_idx').on(table.issuer, table.clientId),
]);
```

### Deployments

A platform can have multiple deployments (e.g., different courses or sub-accounts).

```typescript
export const ltiDeployments = pgTable('lti_deployments', {
  id: varchar('id', { length: nanoidLength }).primaryKey(),
  platformId: varchar('platform_id', { length: nanoidLength })
    .references(() => ltiPlatforms.id).notNull(),
  deploymentId: varchar('deployment_id', { length: 256 }).notNull(), // Platform's deployment_id
  
  // Map to Cella organization
  organizationId: varchar('organization_id', { length: nanoidLength })
    .references(() => organizations.id).notNull(),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('lti_deployments_platform_deployment_idx')
    .on(table.platformId, table.deploymentId),
]);
```

### User Linking

Link LTI users (from platforms) to Cella users.

```typescript
export const ltiUserLinks = pgTable('lti_user_links', {
  id: varchar('id', { length: nanoidLength }).primaryKey(),
  
  // LTI identity
  platformId: varchar('platform_id', { length: nanoidLength })
    .references(() => ltiPlatforms.id).notNull(),
  ltiUserId: varchar('lti_user_id', { length: 256 }).notNull(),  // sub claim
  
  // Cella identity
  userId: varchar('user_id', { length: nanoidLength })
    .references(() => users.id).notNull(),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('lti_user_links_platform_lti_user_idx')
    .on(table.platformId, table.ltiUserId),
]);
```

## Security

### JWT Validation Checklist

1. **Signature verification**: Fetch platform's JWKS, verify RS256 signature
2. **Issuer validation**: `iss` must match registered platform
3. **Audience validation**: `aud` must include our client_id
4. **Expiration check**: `exp` must be in future (with clock skew tolerance of ~5 minutes)
5. **Nonce validation**: Must not have been used before (replay prevention)
6. **State validation**: Must match state from login request

### Nonce/State Storage

```typescript
// Short-lived state for OIDC flow
export const ltiOidcState = pgTable('lti_oidc_state', {
  state: varchar('state', { length: 64 }).primaryKey(),
  nonce: varchar('nonce', { length: 64 }).notNull(),
  platformId: varchar('platform_id', { length: nanoidLength }),
  targetLinkUri: varchar('target_link_uri', { length: 1024 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),  // 10 minutes
});

// Used nonces (for replay attack prevention)
export const ltiUsedNonces = pgTable('lti_used_nonces', {
  nonce: varchar('nonce', { length: 64 }).primaryKey(),
  platformId: varchar('platform_id', { length: nanoidLength }).notNull(),
  usedAt: timestamp('used_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),  // Cleanup after JWT max lifetime
});
```

## User Provisioning

### Strategy Options

| Strategy | Description | Pros | Cons |
|----------|-------------|------|------|
| **Auto-create** | Create Cella user on first LTI launch | Seamless UX | No pre-approval |
| **Link existing** | Require user to log in and link accounts | Controlled | Extra step |
| **Invite-only** | Pre-invite users, LTI launch links to invite | Controlled | Admin overhead |

### Recommended: Auto-create with linking

```typescript
async function provisionUser(claims: LtiLaunchClaims, platform: LtiPlatform) {
  // Check if user already linked
  const existingLink = await db.query.ltiUserLinks.findFirst({
    where: and(
      eq(ltiUserLinks.platformId, platform.id),
      eq(ltiUserLinks.ltiUserId, claims.sub)
    )
  })
  
  if (existingLink) {
    return db.query.users.findFirst({ where: eq(users.id, existingLink.userId) })
  }
  
  // Try to match by email
  if (claims.email) {
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, claims.email)
    })
    if (existingUser) {
      await createLink(platform.id, claims.sub, existingUser.id)
      return existingUser
    }
  }
  
  // Create new user
  const newUser = await createUser({
    email: claims.email,
    name: claims.name || claims.given_name,
    // Mark as LTI-provisioned
    authMethod: 'lti',
  })
  
  await createLink(platform.id, claims.sub, newUser.id)
  return newUser
}
```

## Role Mapping

Map LTI roles to Cella membership roles.

```typescript
const LTI_ROLE_MAPPING: Record<string, string> = {
  // Instructor roles → admin
  'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor': 'admin',
  'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor': 'admin',
  
  // TA roles → member (or custom 'ta' role)
  'http://purl.imsglobal.org/vocab/lis/v2/membership#TeachingAssistant': 'member',
  
  // Learner roles → member
  'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner': 'member',
  'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Student': 'member',
}

function mapLtiRolesToCellaRole(ltiRoles: string[]): string {
  for (const role of ltiRoles) {
    if (LTI_ROLE_MAPPING[role]) {
      return LTI_ROLE_MAPPING[role]
    }
  }
  return 'member' // Default
}
```

## LTI Advantage Services (as client)

When Cella is launched as a tool, it can **call back** to the platform for additional services.

### AGS Client (Assignment and Grade Services)

Submit grades back to the platform.

```typescript
class AgsClient {
  constructor(
    private tokenService: LtiTokenService,
    private endpoint: AgsEndpoint
  ) {}
  
  async postScore(score: Score): Promise<void> {
    const token = await this.tokenService.getAccessToken([
      'https://purl.imsglobal.org/spec/lti-ags/scope/score'
    ])
    
    await fetch(`${this.endpoint.lineitem}/scores`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/vnd.ims.lis.v1.score+json'
      },
      body: JSON.stringify(score)
    })
  }
}

interface Score {
  userId: string           // LTI user ID (sub claim)
  scoreGiven: number       // Actual score
  scoreMaximum: number     // Maximum possible score
  activityProgress: 'Initialized' | 'Started' | 'InProgress' | 'Submitted' | 'Completed'
  gradingProgress: 'FullyGraded' | 'Pending' | 'PendingManual' | 'Failed' | 'NotReady'
  timestamp: string        // ISO 8601
}
```

### NRPS Client (Names and Role Provisioning)

Fetch course roster from platform.

```typescript
class NrpsClient {
  async getMembers(): Promise<Member[]> {
    const token = await this.tokenService.getAccessToken([
      'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly'
    ])
    
    const response = await fetch(this.endpoint.context_memberships_url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json'
      }
    })
    
    const data = await response.json()
    return data.members
  }
}

interface Member {
  user_id: string
  roles: string[]
  status: 'Active' | 'Inactive' | 'Deleted'
  name?: string
  email?: string
  given_name?: string
  family_name?: string
}
```

## Implementation Checklist

### Phase 1: Core Launch (MVP)

- [ ] `POST /lti/login` - OIDC login initiation
  - [ ] Validate incoming request (iss, login_hint, target_link_uri)
  - [ ] Look up platform by issuer
  - [ ] Generate state and nonce
  - [ ] Store state/nonce in database
  - [ ] Redirect to platform's authorization URL
  
- [ ] `POST /lti/launch` - Handle id_token
  - [ ] Validate state parameter
  - [ ] Decode and validate JWT
  - [ ] Verify signature against platform's JWKS
  - [ ] Check nonce hasn't been used
  - [ ] Extract LTI claims
  - [ ] Provision/link user
  - [ ] Create session
  - [ ] Redirect to target resource

- [ ] `GET /.well-known/jwks.json` - Serve our public keys
  - [ ] Generate RSA key pair
  - [ ] Serve public key in JWKS format

- [ ] Platform registration
  - [ ] Database schema
  - [ ] Admin API/UI to register platforms
  - [ ] Import from platform config JSON

### Phase 2: LTI Advantage

- [ ] AGS client
  - [ ] OAuth 2.0 client credentials flow for service tokens
  - [ ] POST scores endpoint
  - [ ] GET results endpoint

- [ ] NRPS client
  - [ ] GET members endpoint
  - [ ] Pagination handling

- [ ] Deep Linking
  - [ ] Build content item response
  - [ ] Sign response JWT

## Platform-Specific Notes

### Canvas LMS

```
Issuer: https://<canvas-domain>
Auth URL: https://<canvas-domain>/api/lti/authorize_redirect
Token URL: https://<canvas-domain>/login/oauth2/token
JWKS URL: https://<canvas-domain>/api/lti/security/jwks
```

### Moodle

```
Issuer: https://<moodle-domain>
Auth URL: https://<moodle-domain>/mod/lti/auth.php
Token URL: https://<moodle-domain>/mod/lti/token.php
JWKS URL: https://<moodle-domain>/mod/lti/certs.php
```

### Blackboard

```
Issuer: https://blackboard.com
Auth URL: https://<blackboard-domain>/learn/api/v1/lti/auth
Token URL: https://<blackboard-domain>/learn/api/v1/oauth2/token
JWKS URL: https://<blackboard-domain>/learn/api/v1/lti/jwks
```

## Testing

### Mock Platform

Create a mock platform for local development that:
1. Serves test JWKS
2. Generates valid id_tokens
3. Simulates the OIDC flow

### IMS Certification

Use the IMS Global certification test suite:
- https://lti-ri.imsglobal.org/platforms

## Open Questions

1. **Session duration**: How long should LTI sessions last?
2. **Re-launch behavior**: What happens when user is re-launched (update context? new session?)
3. **Offline access**: Can users access Cella without going through LTI after initial launch?
4. **Context isolation**: Should users see only resources from their LTI context?
