---
breaking: true
clientCacheBump: false
caughtBy: tests
generate: true
grep: invalid_client_metadata, lti_tool_metadata_invalid
---

# The platform keeps an LTI tool's pages: three oauth_clients columns

`oauth_clients` gains `client_uri`, `tos_uri` and `policy_uri`, nullable `varchar(2048)` columns. Run `pnpm generate` once after the upgrade. The platform also accepts registrations it refused before: no resource link message, more response or grant types, and addresses off the LTI tool's `domain`.

## What & why

LTI Dynamic Registration 1.0 admits a registration without an `LtiResourceLinkRequest` message, `response_types` and `grant_types` beside the ones the platform needs, and addresses on any host, and asks a platform to present `client_uri`, `tos_uri` and `policy_uri`. `register-lti-tool.ts` drops the domain rule and records those three pages (`clientUri`, `tosUri`, `policyUri` on `LtiInstallation`), HTTPS only; the approval dialog links them.

## Blast radius

Every platform app: without the columns, each LTI registration read and write fails, so an inherited LTI test fails. App tests that expect one of these registrations refused now see it accepted. No wire field goes, no cache bump.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it writes the three `ALTER TABLE "oauth_clients" ADD COLUMN` statements; no hints, no hand-written SQL.
2. Where app tests expect `invalid_client_metadata` for a registration with addresses off its `domain`, with more response or grant types, or without a resource link message, expect it registered.

## Verify

```sh
pnpm generate
pnpm check
```
