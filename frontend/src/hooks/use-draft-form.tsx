import { useEffect, useState } from 'react';
import { type FieldPath, type FieldValues, type UseFormProps, type UseFormReturn, useForm } from 'react-hook-form';
import { useDraftStore } from '~/store/draft';

// This hook is used to create a form with unsaved draft support
export function useFormWithDraft<
  TFieldValues extends FieldValues = FieldValues,
  // biome-ignore lint/suspicious/noExplicitAny: any is required here
  TContext = any,
  TTransformedValues extends TFieldValues = TFieldValues,
>(
  formId: string,
  props?: UseFormProps<TFieldValues, TContext>,
): UseFormReturn<TFieldValues, TContext, TTransformedValues> & {
  unsavedChanges: boolean;
  loading: boolean;
} {
  const form = useForm<TFieldValues, TContext, TTransformedValues>(props);
  const getForm = useDraftStore((state) => state.getForm);
  const setForm = useDraftStore((state) => state.setForm);
  const resetForm = useDraftStore((state) => state.resetForm);

  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [loading, setLoading] = useState(true); // loading state

  useEffect(() => {
    const values = getForm<TFieldValues>(formId);

    if (values) {
      setUnsavedChanges(true);
      for (const [key, value] of Object.entries(values)) {
        form.setValue(key as FieldPath<TFieldValues>, value);
      }
    }
    setLoading(false); // Set loading to false once draft values have been applied
  }, [formId]);

  const allFields = form.watch();

  useEffect(() => {
    if (form.formState.isDirty) {
      const values = Object.fromEntries(Object.entries(allFields).filter(([_, value]) => value !== undefined));
      if (Object.keys(values).length > 0) return setForm(formId, values);
    }

    if (unsavedChanges) {
      setUnsavedChanges(false);
      resetForm(formId);
    }
  }, [allFields, formId]);

  return {
    ...form,
    unsavedChanges,
    loading,
    reset: (values, keepStateOptions) => {
      resetForm(formId);
      form.reset(values, keepStateOptions);
    },
  };
}
