---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: logo_url
generate: true
---

# Image templates name the column they fill, and an organization has no logoUrl

The upload templates `avatar` and `cover` are `thumbnail` and `banner`, in `uploadTemplateIds` and as the keys of
`uploadTemplates` in `shared/config/transloadit-config.ts`, where the `cover` step is `banner`; a `getUploadToken` query
sends the new ids. `organizations.logoUrl` is gone: `data.sql` copies a logo into an empty `thumbnail_url` above the
`DROP COLUMN` that `pnpm generate` writes. A federation in `appConfig.federations` takes `logoUrl` where it took `logo`.

## What & why

The `avatar` template wrote `thumbnailUrl` and the `cover` template `bannerUrl`; each now carries its column's name. An
organization's logo is its `thumbnailUrl`, which the settings form's logo field edits, and the `logoUrl` beside it had
no writer in the template. A federation's `logo` held a relative URL where a connection's `logoUrl` holds an absolute
one: both are now `logoUrl`.

## Blast radius

Every app: `shared/config` and `backend/drizzle` are app-owned, and the typecheck names each template id, each typed
`logoUrl` read and a federation's `logo`. Raw SQL, untyped test rows and outside clients that send `avatar` or `cover`
escape it, and an upload queued offline before the upgrade asks for the old id and fails. `clientCacheVersion` moves.

## Run

No script: manual.

## Manual steps

1. In the app's `shared/config` files, rename the `uploadTemplateIds` entries `avatar` and `cover` to `thumbnail` and `banner`, and `logo` to `logoUrl` in each entry of `federations`.
2. In `shared/config/transloadit-config.ts`, rename the templates `avatar` and `cover` to `thumbnail` and `banner`, and the `cover` step and its `use` entry to `banner`.
3. Run `pnpm generate` and paste `data.sql` above the generated `ALTER TABLE "organizations" DROP COLUMN "logo_url"`; an organization with both a logo and a thumbnail keeps only the thumbnail, so an app that writes `logoUrl` moves what it needs first.
4. Remove `logoUrl` where app code, seeds and tests write an organization, and pass `'thumbnail'` or `'banner'` where the app passed `'avatar'` or `'cover'` as a `templateId`.

## Verify

```sh
pnpm migrate
pnpm check
```
