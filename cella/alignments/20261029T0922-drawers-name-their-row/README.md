---
breaking: false
clientCacheBump: false
grep: kind: 'menu'
---

# Mobile drawers name the row they act on

A row's "…" menu opens its mobile drawer with "Organization **name**" and an enum cell editor with "Change status of
**name**", built from the row itself. An app's own dropdowner menu that acts on one entity, such as a card's options
button, passes the new `lead` option of `dropdowner.getState().create` to show the same sentence.

## What & why

A bottom sheet covers the row it came from, so "Status" alone does not say whose status. `TableEllipsis` builds the
lead from the row's `name` and `entityType`, `RenderEnumSelect` from the row's `name` and the column name. It renders
as a `DrawerLead`, in the place where a pushed `openPopConfirm` asks its question, so the swap to a confirmation changes
only the sentence.

## Blast radius

Not breaking: tables on `ellipsisColumn` and `RenderEnumSelect` get it on upgrade, and a row without a `name` keeps its
drawer as before. App menus about one entity: raak `task-options-button.tsx`, `label-options-button.tsx`,
`project-actions-menu.tsx`; projectcampus `item-card-header.tsx`, `material-tile.tsx`, `milestone-box.tsx`.

## Run

No script: manual.

## Manual steps

1. In an app-owned `dropdowner.getState().create(content, { kind: 'menu', … })` whose items act on one entity, add ``lead: <NamedText i18nKey="c:resource_named" name={entity.name} values={{ resource: t(`c:${entity.entityType}`) }} />``; leave menus that act on a page or a list as they are.

## Verify

```sh
pnpm check
```

By hand, in a window narrower than 640px: open the menu, check that the sentence names the entity above its rows, then pick Delete and check that the question takes its place.
