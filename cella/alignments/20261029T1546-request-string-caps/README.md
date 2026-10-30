---
breaking: true
clientCacheBump: false
caughtBy: tests
grep: z.string(), maxLength
---

# Every request string takes a length cap

An app's own request schemas add `.max()` to every string a body, query or path parameter parses, with a `maxLength` constant or the column's length. The new string case in `backend/tests/security/request-bodies.test.ts` fails with the operation id and JSON path of each string that has none.

## What & why

A string without a cap costs whatever `jsonBodyLimit` allows, per field, in the parser, an index, a regex or a mail. The template caps its own strings (shared `idsBodySchema`, `includeQuerySchema`, WebAuthn payloads, OAuth callback parameters, `toolsConfigSchema`, catch-up views) and the table test reads the app's generated OpenAPI document, so a string with no `maxLength`, `enum`, `const` or fixed-length format (`uuid`, `date-time`, `date`, `time`, `ipv4`, `ipv6`) is refused.

## Blast radius

App-owned `*-schema.ts` and `*-routes.ts` files with a bare `z.string()` in a request. No database, lens or cache change. An app without request strings of its own is unaffected.

## Run

No script: manual.

## Manual steps

1. Run the test below; for each operation id and path it names, add `.max(<cap>)` before any refinement or transform: the column's length, else the `maxLength` constant of the field's role (`id`, `field`, `url`, `html`).
2. A field a person types into keeps the limit the UI allows: give the form schema the same cap.

## Verify

```sh
pnpm -C backend exec cross-env TEST_MODE=core vitest run tests/security/request-bodies.test.ts
pnpm check
```
