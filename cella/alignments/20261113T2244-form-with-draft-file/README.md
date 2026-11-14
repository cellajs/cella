---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# The draft form hook's file is named after it

`useFormWithDraft` moves from `form-draft/use-draft-form.ts` to `form-draft/use-form-with-draft.ts`. An app's own
forms import it from the new path; the hook, the draft store and its stored key stay as they were.

## What & why

The file named the hook after the draft, while the store beside it is the draft store: one word for two things. The
file now carries its export's name, so a search for the hook finds its file.

## Blast radius

Every app form that imports `useFormWithDraft`: the compiler flags each import. No wire, cache or schema change, and
stored drafts survive.

## Run

No script: manual.

## Manual steps

1. Replace `~/modules/common/form-draft/use-draft-form` by `~/modules/common/form-draft/use-form-with-draft` in every import.

## Verify

```sh
pnpm check
```
