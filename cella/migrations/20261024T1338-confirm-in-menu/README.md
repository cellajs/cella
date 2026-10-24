---
syncBreaking: true
clientCacheBump: false
---

# Confirmations open inside their menu, and close the overlay they render in

`DeleteItems` and the `Delete*` forms drop the `dialog` prop: they close the dropdown or dialog they render in. A menu
item that asks first takes `confirm={{ title, content }}` (`EllipsisOption.confirm`) instead of calling `openPopConfirm`
itself. A button opens a confirmation with `openConfirm`, a bulk delete with `openDeleteDialog`
(`~/modules/common/open-confirm`). `c:delete_confirm.text` now takes `resource`: render it through `DeleteQuestion`.

## What & why

`openPopConfirm` pushes the confirmation into the open menu (`dropdowner.push`); its Cancel steps back (`back`), and the
menu resizes into it. `OverlayCloseContext` (`useOverlayClose`), provided by the dropdowner and dialoger, closes a
confirmation, so `DeleteForm`'s `onCancel` is optional and `callback={remove}` wiring goes. `DeleteForm` defaults to
`c:confirm_delete`. `DeleteItems` toasts success given `resource`.

## Blast radius

Apps with their own delete forms, row menus or popconfirms. Typecheck flags every `dialog` prop. Not caught: menu items
that call `openPopConfirm` without `closeOnSelect={false}` now close the menu, `c:delete_confirm.text` without `resource`,
and a `ComboboxSearchInput` without `onClear`, which shows no clear X.

## Run

No script: manual.

## Manual steps

1. Remove `dialog` from every `Delete*` component and its props `Pick`, and from `DeleteItems`; drop `callback`/`onCancel` that only closed the dropdown or dialog.
2. Replace a menu item's `onSelect` that calls `openPopConfirm(title, form)` with `confirm={{ title, content: form }}` (on `EllipsisOption`: `confirm: (row) => ({ title, content })`).
3. Replace `dropdowner.create(<PopConfirm …><DeleteForm …/></PopConfirm>, …)` on a button with `openConfirm(trigger, { id, title, onConfirm })`, or `{ content }` for a form with hooks.
4. Replace `<NamedText i18nKey="c:delete_confirm.text" name={…} />` with `<DeleteQuestion resource="c:…" name={…} />`.
5. Move success toasts for non-optimistic deletes into the `Delete*` component as `resource="c:…"` on `DeleteItems`, and remove the caller's toast.
6. Build bulk delete dialogs with `openDeleteDialog({ id, triggerRef, resource, count, content })`.
7. Pass `onClear` to every `ComboboxSearchInput` that keeps its clear X; `showClear` is gone.

## Verify

```sh
pnpm --filter frontend test
pnpm check
```
