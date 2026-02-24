# LTI 1.3 Integration

This document provides an overview of LTI 1.3 concepts and how Cella will support both roles. For implementation details, see the role-specific documents:

- [LTI_AS_TOOL.md](./LTI_AS_TOOL.md) - Cella launched from external platforms (Canvas, Moodle, etc.)
- [LTI_AS_CONSUMER.md](./LTI_AS_CONSUMER.md) - Cella launching external tools (Zoom, Miro, H5P, Padlet, etc.)

## What is LTI?

**Learning Tools Interoperability (LTI)** is an IMS Global standard for integrating learning applications with platforms (LMS). LTI 1.3 is the current version, replacing OAuth 1.0a with OAuth 2.0 + JWT-based security.

## Goals

1. **Dual-role support**: Cella as both LTI Tool and LTI Platform (consumer)
2. **IMS Global compliant**: LTI 1.3 / LTI Advantage certification-ready
3. **Secure by default**: Proper JWT validation, nonce handling, state management
4. **Multi-tenancy**: Support multiple platform/tool registrations per Cella instance
5. **Flexible service integration**: Optional support for LTI Advantage services based on use case

## Terminology

| Term | Also Called | Description |
|------|-------------|-------------|
| **Platform** | Consumer, LMS | The launching system (Canvas, Moodle, or Cella-as-consumer) |
| **Tool** | Provider, App | The launched application (Cella-as-tool, or external tools) |
| **Deployment** | Installation | A specific tool installation within a platform |
| **OIDC Launch** | - | OpenID Connect-based secure launch flow |

### LTI Advantage Services (optional)

LTI Advantage extends core LTI 1.3 with additional services. These are **optional** and depend on your use case:

| Service | Abbreviation | Description | When useful |
|---------|--------------|-------------|-------------|
| Deep Linking | DL | Content item selection and embedding | Always useful - embed external content |
| Names and Role Provisioning | NRPS | Roster/membership sync from platform | User sync between systems |
| Assignment and Grade Services | AGS | Grade passback from tool to platform | Educational/LMS contexts only |

> **Note**: Cella can be used for B2B collaboration, learning platforms, or other contexts. AGS is primarily relevant when integrated with educational systems that track grades.

## Cella's Two Roles

### As Tool (Provider)

External platforms (Canvas, Moodle, Blackboard) launch Cella. Users click a link in their LMS and are seamlessly authenticated into Cella.

**Use case**: University uses Canvas as their LMS, Cella is embedded as a tool for collaborative projects.

```
Canvas (Platform) ──launches──> Cella (Tool)
```

### As Consumer (Platform)

Cella launches external tools. Users click a button in Cella and are taken to a third-party tool with their context preserved.

**Use cases**:
- Launch **Zoom** or **Microsoft Teams** for video meetings
- Open **Miro** or **Padlet** for collaborative whiteboards
- Embed **H5P** for interactive content
- Use **Canva** for design collaboration

```
Cella (Platform) ──launches──> Zoom, Miro, H5P, Padlet (Tools)
```

## LTI 1.3 Launch Flow Overview

Both roles follow the same OIDC-based flow, just with reversed responsibilities:

```
1. Platform sends OIDC login request to Tool
2. Tool redirects back to Platform's authorization endpoint
3. Platform authenticates user and generates signed JWT (id_token)
4. Platform POSTs id_token to Tool's launch endpoint
5. Tool validates JWT and creates session
```

## File Structure

```
backend/src/modules/lti/
├── index.ts                    # Module exports
├── routes.ts                   # LTI route definitions
├── types.ts                    # Shared LTI types
├── errors.ts                   # LTI error definitions
│
├── tool/                       # Cella as LTI Tool
│   └── ...                     # See LTI_AS_TOOL.md
│
├── consumer/                   # Cella as LTI Platform/Consumer
│   └── ...                     # See LTI_AS_CONSUMER.md
│
└── shared/
    ├── jwks.ts                 # JWKS endpoint & key rotation
    ├── nonce-store.ts          # Nonce validation (replay prevention)
    ├── state-store.ts          # State parameter management
    └── claims.ts               # LTI claim constants & builders
```

## LTI Claims Reference

### Required Claims (id_token)

```typescript
interface LtiLaunchClaims {
  // Standard OIDC claims
  iss: string                    // Issuer (platform URL)
  sub: string                    // Subject (user ID on platform)
  aud: string | string[]         // Audience (tool's client_id)
  exp: number                    // Expiration timestamp
  iat: number                    // Issued at timestamp
  nonce: string                  // Replay prevention
  
  // LTI-specific claims
  'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest'
  'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0'
  'https://purl.imsglobal.org/spec/lti/claim/deployment_id': string
  'https://purl.imsglobal.org/spec/lti/claim/target_link_uri': string
  'https://purl.imsglobal.org/spec/lti/claim/resource_link': {
    id: string
    title?: string
    description?: string
  }
  
  // Context (course/organization)
  'https://purl.imsglobal.org/spec/lti/claim/context'?: {
    id: string
    type?: string[]
    label?: string
    title?: string
  }
  
  // Roles
  'https://purl.imsglobal.org/spec/lti/claim/roles': string[]
  
  // User info (optional)
  name?: string
  email?: string
  given_name?: string
  family_name?: string
  picture?: string
}
```

### LTI Advantage Service Claims

```typescript
// Assignment and Grade Services
interface AgsClaim {
  'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint': {
    scope: string[]
    lineitems: string           // URL to lineitems endpoint
    lineitem?: string           // URL to specific lineitem
  }
}

// Names and Role Provisioning Services  
interface NrpsClaim {
  'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice': {
    context_memberships_url: string
    service_versions: string[]
  }
}

// Deep Linking
interface DeepLinkingClaim {
  'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings': {
    deep_link_return_url: string
    accept_types: string[]
    accept_presentation_document_targets: string[]
    accept_multiple?: boolean
    auto_create?: boolean
  }
}
```

## Implementation Phases

| Phase | Scope | Priority |
|-------|-------|----------|
| 1 | Cella as Tool (MVP) | High |
| 2 | LTI Advantage for Tool (AGS, NRPS) | Medium |
| 3 | Cella as Consumer | Medium |
| 4 | LTI Advantage for Consumer | Low |

## Security Considerations

See role-specific documents for detailed security requirements:
- JWT validation, nonce handling, state management
- Key rotation and JWKS serving
- Session binding and context isolation

## Related Documentation

- [IMS Global LTI 1.3 Specification](https://www.imsglobal.org/spec/lti/v1p3/)
- [LTI Advantage](https://www.imsglobal.org/lti-advantage-overview)
- [LMS Integration](./LMS.md) - For direct LMS API integration (separate from LTI)

## Open Questions

1. **User linking strategy**: Auto-create users on first LTI launch, or require pre-registration?
2. **Role mapping**: How to map LTI roles to Cella membership roles?
3. **Multi-organization**: How to handle launches that target different organizations?
4. **Key storage**: Environment variables vs database vs external KMS?
5. **State store**: Database vs Redis for production?

