---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: <EntityAvatar, <EntityChip, TabNavAvatar, AvatarFormField, url=, id=
---

# EntityAvatar takes the entity row

`EntityAvatar` and `EntityChip` take one `entity` prop (`AvatarEntity`: `id`, `entityType`, `name`, `thumbnailUrl`)
where they took `type`, `id`, `name` and `url`. A row passes whole: `<EntityAvatar entity={user} />`. `TabNavAvatar`
is gone: a tab bar's `avatar` is an `AvatarEntity`. `AvatarFormField` loses `type` and reads `entity.entityType`.

## What & why

Every row says `entityType` and `thumbnailUrl`, so about 40 call sites renamed fields into `type` and `url`. The tab
bar's own avatar type fell back to `'organization'`, so every channel's tab avatar reported itself as one. Update
forms also gained `formValuesOf(schema, row)` in `~/utils/form-resolver`, which picks a form's fields from a row.

## Blast radius

Every app that draws avatars or chips in its own modules. The compiler flags `type`, `name` and `url`, but not `id`
(a DOM attribute) nor a JSX spread of an object with the old keys.

## Run

No script: manual.

## Manual steps

1. Rewrite each `<EntityAvatar type= id= name= url=>` and `<EntityChip ...>` as `entity={row}`, or `entity={{ ...row, thumbnailUrl }}` for an assembled value.
2. Give a row without `entityType` one (`{ ...member, entityType: 'user' }`) where its avatar should be round.
3. Replace an app form's hand-written defaults copy with `formValuesOf(formSchema, row)` for `defaultValues` and the post-save `reset`.

## Verify

```sh
pnpm check
```
