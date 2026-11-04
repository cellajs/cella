---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# Drafts are untyped records

`useDraftStore`'s `getForm` and `setForm` lose their type parameter: `getForm(key)` returns `Record<string, unknown> | undefined` and `setForm(key, values)` takes a `Record<string, unknown>`. A call that passes a type argument stops compiling. raak reads its task draft through a partial parse of `createTaskFormSchema`; projectcampus types `restoreCreateDraft`'s values as a record and takes the `setValue` cast `useFormWithDraft` takes.

## What & why

`getForm<T>` asserted a draft restored from IndexedDB to the type its caller named, though a draft an older bundle saved may lack a field the form has now. In raak, `newTaskFormIsDirty` reads `assignedTo.length` off such a draft and throws during render. The store now hands back what it holds, and `useFormWithDraft` takes the one cast where it gives the values back to the form that saved them.

## Blast radius

Breaking for app code that calls `getForm` or `setForm`: in raak two task readers, in projectcampus `restore-create-draft.ts` and three tests. Stored drafts keep their shape. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. raak `frontend/src/modules/task/helpers/create-task.ts`: export `parseTaskDraft = (draft: Record<string, unknown> | undefined) => createTaskFormSchema.partial().safeParse(draft).data`.
2. raak, same file: `newTaskFormIsDirty` takes `Partial<Pick<NewTaskFormValues, 'assignedTo' | 'labels' | 'description'>>` with `assignedTo = []` and `labels = []` defaults.
3. raak, same file (`toggleCreateTaskForm`): `const draftForm = parseTaskDraft(draftStore.getState().getForm(id));`.
4. raak `frontend/src/modules/task/board/new-task-button.tsx`: `const storedForm = parseTaskDraft(state.getForm(createTaskFormId(project.id)));` and drop the `NewTaskFormValues` import.
5. projectcampus `frontend/src/modules/common/form-draft/restore-create-draft.ts`: `restoreCreateDraft(formId: string, values: Record<string, unknown>)`; its three callers pass `z.infer` values, which fit.
6. projectcampus, same file (`loadDraft`): `getForm(formId)` without the type argument, and `setValue(key as FieldPath<TValues>, value as FieldPathValue<TValues, FieldPath<TValues>>, { shouldDirty: true })` as in `use-draft-form.ts`.
7. projectcampus `comment/tests/comment-composer.test.tsx`, `item/tests/create-item-form.test.tsx` and `material/tests/create-material-form.test.tsx`: drop the type argument of `getForm` in `draft()`.

## Verify

```sh
pnpm check
```
