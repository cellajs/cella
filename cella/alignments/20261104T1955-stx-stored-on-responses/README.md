---
breaking: false
clientCacheBump: false
grep: stxBaseSchema
---

# A product response declares its stored stx

`StxStored` (`stxStoredSchema` in `#/schemas`) is `StxBase` plus the optional `changedFields` the server sets on a
write, which every product row has carried to clients undeclared. The template's `attachmentSchema` spreads
`stx: stxStoredSchema`; an app's product schema that spreads `stx: stxBaseSchema` keeps compiling and may switch so its
SDK type says what arrives. A request keeps `StxBase`: the server computes `changedFields`.

## What & why

`buildStx` stores the fields a write changed as `changedFields`, the Yjs materializer reads them, and a product read
returns the row as stored, so the field reached clients while the SDK's `StxBase` lacked it. `stxStoredSchema` names
the stored shape, the stx column is typed by it (`db/utils/stx-columns.ts`), and the attachment response uses it. No
bytes change on the wire.

## Blast radius

Not breaking: `StxBase` is assignable to `StxStored`, and a response typed `StxBase` only under-declares an optional
field. No cache bump: cached rows already hold `changedFields`. No database or lens change.

## Run

No script: manual.

## Manual steps

1. In each product `*-schema.ts`, spread `stx: stxStoredSchema` in the response schema; keep `stxBaseSchema` in the create and update bodies.

## Verify

```sh
pnpm check
```
