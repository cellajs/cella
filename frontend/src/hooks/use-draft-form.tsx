import { useEffect, useState } from 'react';
import { type FieldPath, type FieldValues, type UseFormProps, type UseFormReturn, useForm, useFormState, useWatch } from 'react-hook-form';
import { useDraftStore } from '~/store/draft';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

/**
 * This hook manages form state with draft-saving support. It automatically
 * restores saved drafts on mount and tracks unsaved changes.
 *
 * @param formId - A unique identifier for the form draft storage.
 * @param opt - Optional configuration:
 *   - `formOptions`: Props passed to `useForm()` from react-hook-form.
 *   - `formContainerId`: element id to target and toggle .unsaved-changes class with.
 *
 * @returns - Returns form methods along with:
 *  - `isDirty`: `true` if the form has unsaved changes.
 *  - `unsavedChanges`: `true` if the form has unsaved changes.
 *  - `loading`: `true` while restoring draft data.
 *
 * @example
 * const form = useFormWithDraft<MyFormType>('my-form', {
 *   onUnsavedChanges: () => console.info('Unsaved changes detected!')
 * });
 *
 * return (
 *   <form onSubmit={form.handleSubmit(onSubmit)}>
 *     <input {...form.register('name')} />
 *     {form.unsavedChanges && <span>You have unsaved changes</span>}
 *     <button type="submit">Submit</button>
 *   </form>
 * );
 */
// biome-ignore lint/suspicious/noExplicitAny: Can be any form context
export function useFormWithDraft<TFieldValues extends FieldValues = FieldValues, TContext = any>(
  formId: string,
  opt?: {
    formOptions?: UseFormProps<TFieldValues, TContext>;
    formContainerId?: string;
  },
): UseFormReturn<TFieldValues, TContext, TFieldValues> & {
  unsavedChanges: boolean;
  isDirty: boolean;
  loading: boolean;
} {
  const { formOptions, formContainerId } = opt || {};

  // Draft store hooks
  const getDraftForm = useDraftStore((state) => state.getForm);
  const setDraftForm = useDraftStore((state) => state.setForm);
  const resetDraftForm = useDraftStore((state) => state.resetForm);

  const form = useForm<TFieldValues, TContext, TFieldValues>(formOptions);

  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [loading, setLoading] = useState(true);

  const allFields = useWatch({ control: form.control });
  const { isDirty, defaultValues } = useFormState({ control: form.control });

  // Add or remove `.unsaved-changes` class on container
  const toggleUnsavedBadge = (show: boolean) => {
    const el = document.getElementById(formContainerId || formId);
    if (!el) return;
    el.classList.toggle('unsaved-changes', show);
  };

  // Auto-save draft on change
  useEffect(() => {
    const current = JSON.stringify(allFields);
    const original = JSON.stringify(defaultValues);
    // Form is reset to default values, clear the draft
    if (current === original && unsavedChanges) {
      resetDraftForm(formId);
      form.reset();
      return;
    }

    if (isDirty) {
      const cleanedValues = Object.fromEntries(Object.entries(allFields).filter(([_, v]) => v !== undefined));
      if (Object.keys(cleanedValues).length > 0) setDraftForm(formId, cleanedValues);
    }
  }, [allFields, isDirty, defaultValues]);

  // Update dirty state UI and flag
  useEffect(() => {
    setUnsavedChanges(isDirty);
    toggleUnsavedBadge(isDirty);
  }, [isDirty]);

  // Restore draft on mount
  useEffect(() => {
    const draftData = getDraftForm<TFieldValues>(formId);

    if (draftData) {
      for (const [key, value] of Object.entries(draftData)) form.setValue(key as FieldPath<TFieldValues>, value, { shouldDirty: true });
    }

    setLoading(false);
  }, []);

  return {
    ...form,
    unsavedChanges,
    isDirty,
    loading,
    // Override `handleSubmit` to always process `onInvalid` through a fallback handler
    handleSubmit: (onValid, onInvalid = defaultOnInvalid) => form.handleSubmit(onValid, onInvalid),
    // Override `reset` to also clear the draft + UI state
    reset: (values, keepStateOptions) => {
      resetDraftForm(formId);
      setUnsavedChanges(false);
      toggleUnsavedBadge(false);
      form.reset(values, keepStateOptions);
    },
  };
}
