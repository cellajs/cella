---
breaking: false
clientCacheBump: false
grep: flex flex-col gap-2 sm:flex-row
---

# Form buttons share one row on a phone

A form's submit and cancel buttons sit in `FormActions` (`~/modules/common/form-fields/form-actions`): one row at every
width, the submit button filling it on a phone and a clean form's cancel taking no room. An app form that copied the old
`<div className="flex flex-col gap-2 sm:flex-row">` around `SubmitButton` and `CancelButton` swaps that div for
`<FormActions>`; for raak those are the workspace and project forms.

## What & why

On a phone the old row stacked Cancel under Save, and a clean form's invisible Cancel left an empty full-width band
before the next settings section. `FormActions` keeps both buttons on one line, so Cancel stays in view beside Save.
Settings sections also gained space on a phone: `ToolCard` keeps its vertical padding where it drops the card chrome.

## Blast radius

Visual only. Synced forms and `ToolCard` change with the upgrade; an app form keeps the stacked row until it swaps its
div. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. In app code, find each `<div className="flex flex-col gap-2 sm:flex-row">` that holds a `SubmitButton` and its `CancelButton`, or a `children` slot in that place: make it `<FormActions>` and import it from `~/modules/common/form-fields/form-actions`.
2. raak: `create-workspace-form.tsx` and `update-workspace-form.tsx` in `workspace/`, and `create-project-form.tsx`, `update-project-form.tsx`, `move-project-form.tsx` and `select-project-form.tsx` in `project/`.

## Verify

```sh
pnpm check
```

By hand, at phone width: open a settings form, type in a field, and Save and Cancel share one row; reset it, and Save fills the row alone.
