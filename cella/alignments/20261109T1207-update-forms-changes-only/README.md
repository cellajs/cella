---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: useFormWithDraft
---

# Update forms send only the fields a person changed

Each app form that updates a row through `useFormWithDraft` moves from `form.handleSubmit` to `form.handleChanges`,
which hands it only the fields that differ from the defaults. Its `defaultValues` hold the rendered fields alone, built
by a `toFormValues(entity)`, and after a save it resets with `form.reset(toFormValues(response))`.

## What & why

`useFormWithDraft` gains `handleChanges`, and a draft keeps only the edited fields. The template's organization, user
and tenant forms use it. A form that sent every field it held wrote stale hidden values back: a save undid another
change, released a new cover image, or failed on a stored URL a newer rule refuses. An organization update also refuses
a default language outside its languages.

## Blast radius

Every app form on `useFormWithDraft` that updates a row keeps sending every field until it moves. Nothing fails to
compile. An API caller that sends languages and a default that disagree gets 400 `default_language_not_offered`. No
database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Submit each own update form through `form.handleChanges((changes) => mutate({ path, body: changes }))`; a create form keeps `handleSubmit`.
2. Build its `defaultValues` from the fields it renders, in a `toFormValues(entity)` beside the form schema.
3. After a save, reset with `form.reset(toFormValues(response))`, never with the body or `changes`.
4. A save no longer refuses a stored image URL off the current CDN: look for them with `WHERE thumbnail_url NOT LIKE '<cdn>%'`, and the same for `banner_url` and `logo_url`.

## Verify

Save each moved form with one field edited and read the request body in the network panel: it holds that field alone.

```sh
pnpm check
```
