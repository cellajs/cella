---
breaking: true
clientCacheBump: false
caughtBy: tests
generate: true
grep: AccessScope, AccessScopedEntityType, scopeAllows, requested_scopes, granted_scopes
---

# An installed LTI tool reads members through the API

An app runs `pnpm generate`, which adds `oauth_clients.requested_scopes` and `lti_installations.granted_scopes`. Access
scopes gain `user:read`: a scoped API key or token that holds it reads people as its actor's roles do. App code that
lists the scopes by hand, or reads a scoped proof as one that never reads people, follows.

## What & why

An installed LTI tool reads the people of a channel it is placed in with a token of its own: `client_credentials` with
an assertion its registered key signed, within the scopes an admin granted at approval or later (`updateLtiInstallation`).
`user:read` joins the vocabulary `deriveAccessScopes` builds. A placement binds the installation to its channel, and a
launch names the API in a claim under the issuer.

## Blast radius

Every app: its tests fail until `pnpm generate` adds the two columns. An app with channels below the organization gets
a binding per placed channel on each installation. No `clientCacheVersion` bump, no lens.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it adds the two columns, and no hand-written SQL follows.
2. Where app code lists access scopes by hand or switches over `AccessScope`, add `user:read`.

## Verify

```sh
pnpm generate
pnpm check
```
