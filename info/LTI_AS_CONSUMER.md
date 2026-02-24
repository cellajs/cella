# Cella as LTI Consumer (Platform)

This document covers the implementation of Cella **launching external tools** like Zoom, Miro, H5P, or other LTI-compliant applications.

**Use cases**:
- Launch video conferencing (Zoom, Microsoft Teams)
- Open collaborative whiteboards (Miro, Padlet)
- Embed interactive content (H5P, Canva)
- Integrate specialized tools based on context

See also: [LTI.md](./LTI.md) (general overview) | [LTI_AS_TOOL.md](./LTI_AS_TOOL.md) (being launched by platforms)

## Overview

```
┌──────────────────────────────────────┐
│        Cella (Platform/Consumer)     │
│                                      │
│  User clicks "Launch H5P" →          │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│       External Tool (H5P, etc.)      │
│                                      │
│  - Receives our OIDC login request   │
│  - Redirects back for auth           │
│  - Receives our signed id_token      │
│  - Launches with user context        │
└──────────────────────────────────────┘
```

## Launch Flow

```
User                              Cella (Platform)              External Tool
  │                                  │                               │
  │  1. Click launch tool            │                               │
  │─────────────────────────────────>│                               │
  │                                  │                               │
  │                                  │  2. POST OIDC login request   │
  │                                  │  (iss, login_hint, target)    │
  │                                  │──────────────────────────────>│
  │                                  │                               │
  │                                  │  3. Auth redirect back        │
  │                                  │  (redirect_uri, state, nonce) │
  │                                  │<──────────────────────────────│
  │                                  │                               │
  │                                  │  4. Build & sign id_token JWT │
  │                                  │                               │
  │  5. Auto-submit form to tool     │                               │
  │<─────────────────────────────────│                               │
  │─────────────────────────────────────────────────────────────────>│
  │                                  │                               │
  │                                  │  6. Tool validates & renders  │
  │<─────────────────────────────────────────────────────────────────│
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/lti/platform/launch` | POST | Initiate launch to external tool |
| `/lti/platform/auth` | GET | Authorization callback (from tool) |
| `/lti/platform/deep-link/callback` | POST | Receive Deep Linking selections |
| `/lti/platform/ags/*` | Various | Provide AGS endpoints for tools |
| `/lti/platform/nrps/*` | GET | Provide NRPS endpoints for tools |
| `/.well-known/jwks.json` | GET | Our public keys (shared with Tool role) |

## Architecture

```
backend/src/modules/lti/consumer/
├── index.ts
├── launch-builder.ts       # Build OIDC login request & id_token
├── token-service.ts        # Sign JWTs, manage keys
├── tool-registry.ts        # Store/retrieve tool configs
├── auth-handler.ts         # Handle tool's auth callback
└── services/
    ├── ags-provider.ts     # Serve AGS endpoints for tools
    ├── nrps-provider.ts    # Serve NRPS endpoints for tools
    └── deep-linking.ts     # Handle content item selections
```

## Database Schema

### Tool Registration

Stores information about external tools that Cella can launch.

```typescript
export const ltiTools = pgTable('lti_tools', {
  id: varchar('id', { length: nanoidLength }).primaryKey(),
  
  // Tool identification
  name: varchar('name', { length: 256 }).notNull(),
  description: text('description'),
  iconUrl: varchar('icon_url', { length: 512 }),
  
  // Tool endpoints
  oidcLoginUrl: varchar('oidc_login_url', { length: 512 }).notNull(),
  launchUrl: varchar('launch_url', { length: 512 }).notNull(),
  jwksUrl: varchar('jwks_url', { length: 512 }),  // For validating tool's signatures
  
  // Tool capabilities
  supportsDeepLinking: boolean('supports_deep_linking').default(false),
  supportsAgs: boolean('supports_ags').default(false),
  supportsNrps: boolean('supports_nrps').default(false),
  
  // Default custom parameters (JSON)
  customParameters: jsonb('custom_parameters'),
  
  // LTI configuration
  publicKey: text('public_key'),  // Tool's public key (if not using JWKS)
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### Tool Deployments per Organization

```typescript
export const ltiToolDeployments = pgTable('lti_tool_deployments', {
  id: varchar('id', { length: nanoidLength }).primaryKey(),
  toolId: varchar('tool_id', { length: nanoidLength })
    .references(() => ltiTools.id).notNull(),
  organizationId: varchar('organization_id', { length: nanoidLength })
    .references(() => organizations.id).notNull(),
  
  // Deployment-specific settings
  clientId: varchar('client_id', { length: 256 }).notNull(),   // Tool's client_id for us
  deploymentId: varchar('deployment_id', { length: 256 }).notNull(),
  
  // Override custom parameters for this deployment
  customParameters: jsonb('custom_parameters'),
  
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('lti_tool_deployments_tool_org_idx')
    .on(table.toolId, table.organizationId),
]);
```

### Resource Links

Track specific tool placements/links within Cella.

```typescript
export const ltiResourceLinks = pgTable('lti_resource_links', {
  id: varchar('id', { length: nanoidLength }).primaryKey(),
  deploymentId: varchar('deployment_id', { length: nanoidLength })
    .references(() => ltiToolDeployments.id).notNull(),
  
  // Resource identification
  title: varchar('title', { length: 256 }),
  description: text('description'),
  
  // Custom parameters for this specific link
  customParameters: jsonb('custom_parameters'),
  
  // Link to Cella entity (e.g., a page, assignment, etc.)
  entityType: varchar('entity_type', { length: 64 }),
  entityId: varchar('entity_id', { length: nanoidLength }),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

## Key Management

As a platform, Cella needs to **sign JWTs** that tools will validate.

### Key Storage Options

| Option | Pros | Cons |
|--------|------|------|
| Environment variables | Simple, secure | No rotation without restart |
| Database | Rotation support, multiple keys | Need to encrypt at rest |
| External KMS | Best security | Infrastructure dependency |

### Key Rotation

```typescript
export const ltiPlatformKeys = pgTable('lti_platform_keys', {
  id: varchar('id', { length: nanoidLength }).primaryKey(),
  
  // Key material
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),  // Encrypted at rest
  algorithm: varchar('algorithm', { length: 16 }).default('RS256'),
  
  // Key lifecycle
  isPrimary: boolean('is_primary').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'),
  revokedAt: timestamp('revoked_at'),
});
```

Rotation strategy:
1. Generate new key pair
2. Mark new key as primary
3. Keep old key active for grace period (tools cache JWKS)
4. Remove old key from JWKS after grace period

### JWKS Endpoint

```typescript
// GET /.well-known/jwks.json
app.get('/.well-known/jwks.json', async (ctx) => {
  const keys = await db.query.ltiPlatformKeys.findMany({
    where: isNull(ltiPlatformKeys.revokedAt)
  })
  
  return ctx.json({
    keys: keys.map(key => ({
      kty: 'RSA',
      alg: 'RS256',
      use: 'sig',
      kid: key.id,
      n: extractModulus(key.publicKey),
      e: extractExponent(key.publicKey),
    }))
  })
})
```

## Building the id_token

```typescript
async function buildIdToken(
  user: User,
  tool: LtiTool,
  deployment: LtiToolDeployment,
  resourceLink: LtiResourceLink,
  context?: LtiContext
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const nonce = generateNonce()
  
  const claims: LtiLaunchClaims = {
    // OIDC claims
    iss: config.lti.issuer,  // Our issuer URL (e.g., https://cella.example.com)
    sub: user.id,
    aud: deployment.clientId,
    exp: now + 3600,  // 1 hour
    iat: now,
    nonce,
    
    // User info
    name: user.name,
    email: user.email,
    given_name: user.firstName,
    family_name: user.lastName,
    picture: user.avatarUrl,
    
    // LTI claims
    'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
    'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
    'https://purl.imsglobal.org/spec/lti/claim/deployment_id': deployment.deploymentId,
    'https://purl.imsglobal.org/spec/lti/claim/target_link_uri': tool.launchUrl,
    'https://purl.imsglobal.org/spec/lti/claim/resource_link': {
      id: resourceLink.id,
      title: resourceLink.title,
      description: resourceLink.description,
    },
    
    // Roles
    'https://purl.imsglobal.org/spec/lti/claim/roles': mapCellaRolesToLti(user, context),
    
    // Context (if applicable)
    ...(context && {
      'https://purl.imsglobal.org/spec/lti/claim/context': {
        id: context.id,
        type: context.types,
        label: context.label,
        title: context.title,
      }
    }),
    
    // Custom parameters
    ...(deployment.customParameters || tool.customParameters) && {
      'https://purl.imsglobal.org/spec/lti/claim/custom': {
        ...tool.customParameters,
        ...deployment.customParameters,
        ...resourceLink.customParameters,
      }
    },
  }
  
  // Add service claims if tool supports them
  if (tool.supportsAgs) {
    claims['https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'] = {
      scope: [
        'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
        'https://purl.imsglobal.org/spec/lti-ags/scope/score',
        'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
      ],
      lineitems: `${config.lti.issuer}/lti/platform/ags/${resourceLink.id}/lineitems`,
    }
  }
  
  if (tool.supportsNrps) {
    claims['https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice'] = {
      context_memberships_url: `${config.lti.issuer}/lti/platform/nrps/${context.id}/memberships`,
      service_versions: ['2.0'],
    }
  }
  
  // Sign the token
  const primaryKey = await getPrimarySigningKey()
  return jwt.sign(claims, primaryKey.privateKey, {
    algorithm: 'RS256',
    keyid: primaryKey.id,
  })
}
```

## Role Mapping (Cella → LTI)

```typescript
function mapCellaRolesToLti(user: User, context?: LtiContext): string[] {
  const roles: string[] = []
  
  // System-level roles
  if (user.role === 'admin') {
    roles.push('http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator')
  }
  
  // Context-level roles (if launching within an organization/course)
  if (context?.membership) {
    switch (context.membership.role) {
      case 'admin':
        roles.push('http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor')
        break
      case 'member':
        roles.push('http://purl.imsglobal.org/vocab/lis/v2/membership#Learner')
        break
    }
  }
  
  return roles
}
```

## LTI Advantage Services (as provider)

When Cella launches tools, it may need to **provide service endpoints** for tools to call back.

### AGS Provider (Assignment and Grade Services)

Receive grades from tools.

```typescript
// POST /lti/platform/ags/:resourceLinkId/lineitems/:lineitemId/scores
app.post('/lti/platform/ags/:resourceLinkId/lineitems/:lineitemId/scores', async (ctx) => {
  // Validate access token
  const token = ctx.req.header('Authorization')?.replace('Bearer ', '')
  await validateServiceToken(token, ['https://purl.imsglobal.org/spec/lti-ags/scope/score'])
  
  const score = await ctx.req.json()
  
  // Store the score in Cella
  await db.insert(ltiScores).values({
    resourceLinkId: ctx.req.param('resourceLinkId'),
    lineitemId: ctx.req.param('lineitemId'),
    userId: score.userId,
    scoreGiven: score.scoreGiven,
    scoreMaximum: score.scoreMaximum,
    activityProgress: score.activityProgress,
    gradingProgress: score.gradingProgress,
    timestamp: score.timestamp,
  })
  
  return ctx.body(null, 204)
})
```

### NRPS Provider (Names and Role Provisioning)

Provide roster to tools.

```typescript
// GET /lti/platform/nrps/:contextId/memberships
app.get('/lti/platform/nrps/:contextId/memberships', async (ctx) => {
  // Validate access token
  const token = ctx.req.header('Authorization')?.replace('Bearer ', '')
  await validateServiceToken(token, ['https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly'])
  
  const contextId = ctx.req.param('contextId')
  
  // Get organization members
  const members = await db.query.memberships.findMany({
    where: eq(memberships.organizationId, contextId),
    with: { user: true }
  })
  
  return ctx.json({
    id: `${config.lti.issuer}/lti/platform/nrps/${contextId}/memberships`,
    context: {
      id: contextId,
    },
    members: members.map(m => ({
      user_id: m.user.id,
      roles: mapCellaRolesToLti(m.user, { membership: m }),
      status: 'Active',
      name: m.user.name,
      email: m.user.email,
      given_name: m.user.firstName,
      family_name: m.user.lastName,
    }))
  })
})
```

### Deep Linking

Allow tools to return content selections.

```typescript
// POST /lti/platform/deep-link/callback
app.post('/lti/platform/deep-link/callback', async (ctx) => {
  const { JWT: responseJwt } = await ctx.req.parseBody()
  
  // Validate the response JWT from the tool
  const tool = await getToolFromState(ctx)
  const claims = await validateToolJwt(responseJwt, tool)
  
  // Extract content items
  const contentItems = claims['https://purl.imsglobal.org/spec/lti-dl/claim/content_items']
  
  // Process content items (create resource links, etc.)
  for (const item of contentItems) {
    if (item.type === 'ltiResourceLink') {
      await db.insert(ltiResourceLinks).values({
        deploymentId: claims.deploymentId,
        title: item.title,
        description: item.text,
        customParameters: item.custom,
        // Link to the Cella entity where this was embedded
        entityType: ctx.state.entityType,
        entityId: ctx.state.entityId,
      })
    }
  }
  
  // Redirect back to Cella UI
  return ctx.redirect(ctx.state.returnUrl)
})
```

## Implementation Checklist

### Phase 1: Core Launch

- [ ] Tool registration
  - [ ] Database schema
  - [ ] Admin API/UI to register tools
  - [ ] Import from tool config URL

- [ ] Launch flow
  - [ ] `POST /lti/platform/launch` - Initiate launch
  - [ ] `GET /lti/platform/auth` - Handle tool's auth callback
  - [ ] Build and sign id_token
  - [ ] Auto-submit form to tool

- [ ] Key management
  - [ ] Generate RSA key pair
  - [ ] Store keys (database or env)
  - [ ] Serve JWKS endpoint

### Phase 2: LTI Advantage

- [ ] AGS provider
  - [ ] Line items CRUD
  - [ ] Score submission endpoint
  - [ ] Results retrieval endpoint

- [ ] NRPS provider
  - [ ] Memberships endpoint
  - [ ] Pagination

- [ ] Deep Linking
  - [ ] Initiate Deep Linking request
  - [ ] Handle content item callback
  - [ ] Create resource links from selections

### Phase 3: UI Integration

- [ ] Tool browser/selector component
- [ ] Embed tools in pages/content
- [ ] Display external content inline

## Frontend Integration

### Launch Button Component

```typescript
function LaunchToolButton({ toolId, context }: { toolId: string, context?: LaunchContext }) {
  const launchTool = useMutation({
    mutationFn: async () => {
      const response = await api.post('/lti/platform/launch', {
        toolId,
        context,
      })
      return response.data
    },
    onSuccess: (data) => {
      // Open tool in new window or iframe
      if (data.presentationTarget === 'window') {
        window.open(data.launchUrl, '_blank')
      } else {
        // Handle iframe embedding
      }
    }
  })
  
  return (
    <Button onClick={() => launchTool.mutate()}>
      Launch Tool
    </Button>
  )
}
```

### Tool Registry UI

Admin interface to:
- Add/edit/remove tools
- Configure deployments per organization
- Test tool launches
- View launch history

## Security Considerations

1. **Token signing**: Use RS256, rotate keys periodically
2. **Service token validation**: Validate scopes, expiration, audience
3. **Content isolation**: Tools should only access authorized contexts
4. **HTTPS only**: All LTI endpoints must be HTTPS
5. **State validation**: Prevent CSRF in launch flow

## Common Tools to Support

| Tool | Description | LTI Support | Category |
|------|-------------|-------------|----------|
| Zoom | Video conferencing | LTI 1.3 | Communication |
| Microsoft Teams | Video & chat | LTI 1.3 | Communication |
| Miro | Collaborative whiteboard | LTI 1.3 | Collaboration |
| Padlet | Collaborative boards | LTI 1.3 | Collaboration |
| H5P | Interactive content | Full LTI 1.3 | Content |
| Canva | Design collaboration | LTI 1.3 | Content |
| Kaltura | Video platform | LTI 1.3 | Media |
| Panopto | Video hosting | LTI 1.3 | Media |
| Turnitin | Plagiarism detection | LTI Advantage | Education-specific |

> **Note**: Not all tools require all LTI Advantage services. Many B2B tools only need core LTI 1.3 launch.

## Open Questions

1. **Iframe vs popup**: How should tools be displayed? (configurable per tool?)
2. **Data sync**: How to handle data returned from tools? (context-dependent)
3. **Content embedding**: How to show Deep Linking selections in Cella UI?
4. **Multi-tenancy**: Should organizations have separate tool registrations?
