---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: tag/base
---

# Schema docs in four buckets by role: base becomes embedded, stream is new, orphan names go

An app's own schema tagged `schemaTags('base', …)` changes to `schemaTags('embedded', …)`, which the typed `kind`
parameter now demands. An import of the SDK type `StxStored`, `ConnectedApp`, `SsoEntry` or `InactiveMembership` moves
to the operation's response type (`Attachment['stx']`, `GetConnectedAppsResponse`, `GetSsoEntryResponse`,
`GetMyInvitationsResponse`). A docs link to `#tag/base` becomes `#tag/embedded`.

## What & why

The schemas page groups components by role: `data` (returned whole), `embedded` (inside other shapes), `stream` (the
app stream frames, new) and `errors`. `schemaTags` types its first argument as that kind. Four names leave the spec:
`StxStored`, `ConnectedApp`, `SsoEntry` and `InactiveMembership` are each returned by one operation and are documented
there. Two dead names go from the code, `Membership` and `SystemRoleBase`, which never reached the spec. The stream
route documents its frames as a union.

## Blast radius

Apps whose own schemas use the `base` kind, import one of the four dropped SDK types, or link to `#tag/base`. Response
bodies are unchanged: no cache bump. raak and projectcampus use the kind only in template files and import none of the
types.

## Run

No script: manual.

## Manual steps

1. Run `pnpm sdk`.
2. Change `schemaTags('base', …)` to `schemaTags('embedded', …)` in app-owned schemas; the typecheck lists them.
3. Replace an import of `StxStored`, `ConnectedApp`, `SsoEntry` or `InactiveMembership` from `sdk` with the operation's response type.
4. Change a docs link `#tag/base` to `#tag/embedded`.

## Verify

```sh
pnpm sdk
pnpm check
```
