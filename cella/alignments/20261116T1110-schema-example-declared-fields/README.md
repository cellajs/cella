---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: .omit(
---

# A schema's example holds only the fields the schema declares

`pnpm sdk` now refuses a named schema whose example carries a field the schema does not declare, and names the schema
and the field. An app whose response schema omits a column while its mock and its answers still carry it takes the
column off the answer and the mock, or declares it. The refusal sees the mock only: the answer is the app's to check.

## What & why

`validateOpenApiDocument` (`backend/src/core/openapi-validation.ts`) compares each named schema's example with its
declared fields, through `allOf` and `$ref`; a schema with a `catchall` and a union are skipped. A response mock is
built from the row, so an undeclared field in it is a column the answer sends while the document and the SDK say it
does not exist. The template's `User` answered `updatedBy` this way; `servedUserSelect` now leaves it out.

## Blast radius

Breaking for an app with a named schema whose mock carries a field the schema omits: `pnpm sdk`, `pnpm check` and a
development boot refuse. A deployed backend never refuses. No database, lens or cache-version change. `User` answers
no longer carry `updatedBy`, which no SDK type held.

## Run

No script: manual.

## Manual steps

1. Run `pnpm sdk`. It names one schema and its undeclared fields per run; work steps 2 to 4 and run it again until it passes.
2. Decide per field: off the wire, or declared. A writer id (`<verb>By`) is declared only as a reference: spread `auditShape` or `tombstoneShape` and answer through `withActorRefs`, never the raw id.
3. Off the wire, the answer: every operation that answers the schema builds its body without the column, by a select that leaves it out or one response builder all answers pass through. Omitting it from the schema or the mock alone leaves it in the answer.
4. Off the wire, the mock: the response mock drops the field.
5. projectcampus: `Item` and `Material` carry `hiddenBy` (`item-schema.ts`, `material-schema.ts`; answers in `item/operations/{get-item,get-items,update-item}.ts` and `material/operations/{get-material,update-material}.ts`). raak has none.

## Verify

```sh
pnpm sdk
pnpm check
```

For each schema step 1 named, request one entity and one list as a member and read the body: the field is absent, or
an object where step 2 declared it as a reference.
