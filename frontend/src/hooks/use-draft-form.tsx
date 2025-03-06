import { useEffect, useState } from 'react';
import { type FieldPath, type FieldValues, type UseFormProps, type UseFormReturn, useForm } from 'react-hook-form';
import { useDraftStore } from '~/store/draft';

/**
 * useFormWithDraft
 *
 * This hook manages form state with draft-saving support. It automatically
 * restores saved drafts on mount and tracks unsaved changes.
 *
 * @param formId - A unique identifier for the form draft storage.
 * @param opt - Optional configuration:
 *   - `formOptions`: Props passed to `useForm()` from react-hook-form.
 *   - `onUnsavedChanges`: Callback triggered when unsaved changes are detected.
 *
 * @returns - Returns form methods along with:
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
export function useFormWithDraft<
  TFieldValues extends FieldValues = FieldValues,
  // biome-ignore lint/suspicious/noExplicitAny: any is required here
  TContext = any,
  TTransformedValues extends TFieldValues = TFieldValues,
>(
  formId: string,
  opt?: {
    formOptions?: UseFormProps<TFieldValues, TContext>;
    onUnsavedChanges?: () => void;
  },
): UseFormReturn<TFieldValues, TContext, TTransformedValues> & {
  unsavedChanges: boolean;
  loading: boolean;
} {
  const { formOptions, onUnsavedChanges } = opt || {};
  const form = useForm<TFieldValues, TContext, TTransformedValues>(formOptions);
  const getForm = useDraftStore((state) => state.getForm);
  const setForm = useDraftStore((state) => state.setForm);
  const resetForm = useDraftStore((state) => state.resetForm);

  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [loading, setLoading] = useState(true); // loading state

  useEffect(() => {
    const values = getForm<TFieldValues>(formId);

    if (values) {
      onUnsavedChanges?.();
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
      if (Object.keys(values).length > 0) {
        return setForm(formId, values);
      }
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
