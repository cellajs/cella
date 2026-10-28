---
syncBreaking: true
clientCacheBump: false
caughtBy: compiler
grep: toLowerCase, resourceLowerCase, upload_item, success.update_item, success.you_left_entity, invitation_settled, request_verification, c:found, c:ago
roots: frontend/src, backend/src
---

# Locale keys follow one set of families, and a key lowercases its noun slot

Template keys were renamed into families (`confirm.<verb>_resource`, `success.<verb>_resource`, `<noun>_count`,
`<key>_counted`, `placeholder.<what>`, `.text` only on sentences), about 55 unused keys left `common.json`, and a
translation now lowercases a noun inside a sentence itself with `{{resource, lowercase}}`. App code renames its key
calls, drops `.toLowerCase()` on values it passes into such a slot, and passes no `appName` or `company`. The codemod
does the renames and the drops, and copies removed keys the app still calls into `locales/en/app.json`.

## What & why

The same text lived under several keys, `.toLowerCase()` sat at about 290 call sites across the apps, and sentences
were built from word fragments that break in Dutch. A `lowercase` formatter and `interpolation.defaultVariables`
(`appName`, `company`) are registered in `shared/utils/i18n-text`. `locales/README.md` lists the families and the
sentence rule.

## Blast radius

Sync-breaking: a call of a renamed or removed key fails typecheck. Visible without errors: an app key that receives a
template-passed `resource` mid-sentence now gets the label form ("Organization"), until it writes
`{{resource, lowercase}}`. No database, lens or `clientCacheVersion` change.

## Run

```sh
pnpm cella align --run 20261028T1013-locale-patterns                                    # report only
pnpm cella align --run 20261028T1013-locale-patterns -- rewrite frontend/src backend/src   # apply
```

## Manual steps

1. For each `judge` line, switch to the key it names; those keys take other values (`item` and `entity` became `resource` or `name`).
2. In the app's own keys, write `{{resource, lowercase}}`, `{{role, lowercase}}` or `{{inputLabel, lowercase}}` where the noun sits inside a sentence, and drop the `.toLowerCase()` the caller applied.
3. Rephrase an own key with an article or demonstrative before a noun slot (`this {{resource}}`): name the thing with `<strong>{{name}}</strong>`, or say "it".
4. Replace JSX that sets words next to each other (`{count} {t(label)}`, a `found` or `ago` span) with one key: `c:resource_count`, `c:resource_count_found` or `c:time_ago`.
5. Delete app.json keys whose text now equals `common.json`, and the `_one`/`_other` pairs whose two texts are the same.
6. Move app keys that use the pre-rename names of a family to the new shape (`success.<verb>_resource`, `confirm.<verb>_resource`).

## Verify

```sh
pnpm cella align --run 20261028T1013-locale-patterns   # no rewrites left; judge lines only where the app decided to keep a key
pnpm check
```

Then read a few toasts, confirmations and empty states in the app in English and in Dutch.
