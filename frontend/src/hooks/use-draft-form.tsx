import { useEffect, useState } from 'react';
import { type FieldPath, type FieldValues, type UseFormProps, type UseFormReturn, useForm } from 'react-hook-form';
import { useDraftStore } from '~/store/draft';

export function useFormWithDraft<
  TFieldValues extends FieldValues = FieldValues,
  // biome-ignore lint/suspicious/noExplicitAny: Can be any form context
  TContext = any,
  TTransformedValues extends TFieldValues = TFieldValues,
>(
  formId: string,
  opt?: {
    formOptions?: UseFormProps<TFieldValues, TContext>;
    formContainerId?: string;
  },
): UseFormReturn<TFieldValues, TContext, TTransformedValues> & {
  unsavedChanges: boolean;
  loading: boolean;
} {
  const { formOptions, formContainerId } = opt || {};
  const form = useForm<TFieldValues, TContext, TTransformedValues>(formOptions);

  const getDraftForm = useDraftStore((state) => state.getForm);
  const setDraftForm = useDraftStore((state) => state.setForm);
  const resetDraftForm = useDraftStore((state) => state.resetForm);

  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [loading, setLoading] = useState(true);

  // Watch all fields
  const allFields = form.watch();

  // Make unsaved badge appear above form
  const toggleUnsavedBadge = (showBadge: boolean) => {
    const parentElement = document.getElementById(formContainerId || formId);
    if (!parentElement) return;
    showBadge ? parentElement.classList.add('unsaved-changes') : parentElement.classList.remove('unsaved-changes');
  };

  useEffect(() => {
    // Get draft values from store
    const values = getDraftForm<TFieldValues>(formId);

    // If there is draft, set them to form and show badge
    if (values) {
      setUnsavedChanges(true);
      toggleUnsavedBadge(true);
      for (const [key, value] of Object.entries(values)) {
        form.setValue(key as FieldPath<TFieldValues>, value);
      }
    }

    setLoading(false);
  }, [formId]);

  useEffect(() => {
    // If the form is dirty, save the draft
    if (form.formState.isDirty) {
      const values = Object.fromEntries(Object.entries(allFields).filter(([_, value]) => value !== undefined));
      if (Object.keys(values).length > 0) {
        return setDraftForm(formId, values);
      }
    }

    // Else, remove the draft
    if (unsavedChanges) {
      setUnsavedChanges(false);
      toggleUnsavedBadge(false);
      resetDraftForm(formId);
    }
  }, [allFields, formId]);

  // Return form with some extras
  return {
    ...form,
    unsavedChanges,
    loading,
    reset: (values, keepStateOptions) => {
      resetDraftForm(formId);
      form.reset(values, keepStateOptions);
      setUnsavedChanges(false);
      toggleUnsavedBadge(false);
    },
  };
}
