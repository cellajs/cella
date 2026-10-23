---
syncBreaking: true
clientCacheBump: false
---

# ConfirmText is NamedText, and sheets name their entity

`~/modules/common/confirm-text` is now `~/modules/common/named-text`, exporting `NamedText` in place of `ConfirmText`.
It takes a `name` prop, which it cuts in the middle past 40 characters. A sheet or dialog opened over an entity page
names that entity in `<strong>` instead of saying "this organization"; apply that to the app's own sheets and dialogs.

## What & why

`pending_invitations.text`, `invite_members.text` and `confirm.remove_members` said "this organization". Once a sheet
covers the page, its header with the name is out of view, so they now take `{{name}}` in `<strong>`.
`delete_resource_notice.text` marks its name too. One component now renders confirmations and descriptions, hence the
new name.

## Blast radius

App-owned files that import `ConfirmText` fail typecheck. App code that calls one of the four keys with `t()` instead of
`NamedText` shows a plain name, or `{{name}}` when it passes none. No database or cache change.

## Run

No script: manual.

## Manual steps

1. `grep -rl ConfirmText frontend/src`: import `NamedText` from `~/modules/common/named-text`, and turn `values={{ name: x }}` into `name={x}`.
2. Find the app's own calls of the four keys (`grep -rn "pending_invitations.text\|invite_members.text\|remove_members\|delete_resource_notice.text" frontend/src`) and render them through `NamedText` with the entity's `name`.
3. Read the app's sheet and dialog descriptions for "this {{resource}}" or "this project": where one opens over that entity's page, name the entity as `<strong>{{name}}</strong>` and render it through `NamedText`.
4. Leave texts that describe a kind of tab or card (`tab_*.text`) generic.

## Verify

```sh
pnpm check
```
