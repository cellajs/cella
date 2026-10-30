---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: addressAuthority, jitProvisioning, claimValues, connectionId
---

# A federated address proves only its connection's domains

An SSO sign-in stores the address it asserts only when that address is on one of the connection's `claimValues` or
their subdomains, and a first sign-in with any other address answers `sso_email_unproven` with the recovery link. A
connect grants a membership only with `jitProvisioning`, and the tenant's sign-in policy counts a federation session
only through the tenant's own connection. An app with SSO accounts lists the addresses proven before this rule with
`check.sql`.

## What & why

An identity provider behind a federation can release any `mail`, so an account could hold another person's address as
proven and collect its invitations. `provesAddress` (`backend/src/modules/auth/sso/helpers/address-authority.ts`) ties
the address to the connection's domains in `provisionSsoUser`, `completeSsoSignIn` and `connectSsoIdentity`. A connect
skipped `jitProvisioning`, and `tenantGuard` never compared `actor.connectionId` with the tenant's connection.

## Blast radius

Every app with SSO connections. A member whose institution mails from a domain outside `claimValues` confirms the
address by magic link. A member bound to an SSO-only tenant is refused when signed in through another connection or
through a session that recorded none. No schema, wire or cache change.

## Run

No script: manual.

## Manual steps

1. For each SSO connection, compare `claimValues` with the mail domains its members use; add a domain only when the institution also asserts it as its own, since `claimValues` also decide which sign-ins a connection accepts.
2. Run `check.sql` from this folder against each environment's database as its owner and decide per listed address; keeping it is the default.
3. In app tests that sign a member of an SSO-only tenant in with a federation strategy, pass the tenant's connection id to the session.

## Verify

```sh
pnpm check
pnpm test
```
