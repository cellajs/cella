---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# The a11y scope config reads the API through the SDK

`AuditApi` is gone from `a11y/src/scope.ts`. In the app-owned `a11y/scope-config.ts`, `prepare` and each
`placeholders` resolver take the SDK's client: `prepare = async (client: Client) => ...` and
`placeholders: Record<string, (client: Client) => Promise<string | null>>`, with `Client` from `sdk/client`. They
call the generated functions of `sdk` with `{ client }` in place of `api<T>(path)`. raak: `administeredOrganization`
and `firstChannelPath`; projectcampus: `channelPaths` and the resolvers that call it.

## What & why

`AuditApi<T>` returned `response.json()` as whatever type its caller named, and `scope-config.ts` named hand-written
copies of the `/me`, `/organizations` and `/me/memberships` responses, with `role` and `contrast` as plain strings. A
backend change compiled and broke the audit at its first run. The session now builds one SDK client with the minted
session cookie, and each generated function types its response and checks it against the spec.

## Blast radius

Every app that carries `a11y/`: its pinned `scope-config.ts` imports `AuditApi` and fails to compile. A failed call
still stops the audit with its method, path and status. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. In `a11y/scope-config.ts`, drop `AuditApi` from the `./src/scope.ts` import and add `import type { Client } from 'sdk/client'`.
2. Type `prepare`, every resolver and every helper they call with `client: Client` in place of `api: AuditApi`.
3. Replace each `api<T>(path)` with the generated function of that path from `sdk`, its query as an object: `api('/me')` is `getMe({ client })`, `api('/me', { method: 'PUT', body })` is `updateMe({ client, body })`, `api('/organizations?limit=50')` is `getOrganizations({ client, query: { limit: 50 } })`, `api('/me/memberships')` is `getMyMemberships({ client })`.
4. raak `firstChannelPath`: call `getWorkspaces` or `getProjects` by `type`, with `query: { organizationId: organization.id, role: 'admin', limit: 1 }` and again without `role`.
5. projectcampus `channelPaths`: map its `ChannelList` to `getCourses`, `getCourseSections` or `getProjects`, with `query: { limit: 50, role }`; `role` takes the role union of those queries in place of `string`.

## Verify

```sh
pnpm check
pnpm a11y:run --states org-members
```
