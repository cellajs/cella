import { useEffect, useState } from 'react';
import { FieldValues, Path, UseFormProps, UseFormReturn, useForm } from 'react-hook-form';
import { useDraftStore } from '~/store/draft';

export function useFormWithDraft<
  TFieldValues extends FieldValues = FieldValues,
  // biome-ignore lint/suspicious/noExplicitAny: any is required here
  TContext = any,
  TTransformedValues extends FieldValues = TFieldValues,
>(
  formId: string,
  props?: UseFormProps<TFieldValues, TContext>,
): UseFormReturn<TFieldValues, TContext, TTransformedValues> & {
  unsavedChanges: boolean;
} {
  const form = useForm<TFieldValues, TContext, TTransformedValues>(props);
  const getForm = useDraftStore((state) => state.getForm);
  const setForm = useDraftStore((state) => state.setForm);
  const resetForm = useDraftStore((state) => state.resetForm);

  const [unsavedChanges, setUnsavedChanges] = useState(false);

  useEffect(() => {
    const values = getForm<TFieldValues>(formId);
    if (values) {
      setUnsavedChanges(true);
      for (const key in values) {
        form.setValue(key as unknown as Path<TFieldValues>, values[key as keyof TFieldValues]);
      }
    } else {
      setUnsavedChanges(false);
    }
  }, [form, getForm]);

  const allFields = form.watch();

  useEffect(() => {
    if (form.formState.isDirty) {
      const values = Object.fromEntries(Object.entries(allFields).filter(([_, value]) => value !== undefined));
      if (Object.keys(values).length > 0) {
        return setForm(formId, values);
      }
    }
  }, [allFields, setForm, formId]);

  return {
    ...form,
    unsavedChanges,
    reset: (values, keepStateOptions) => {
      resetForm(formId);
      form.reset(values, keepStateOptions);
    },
  };
}
