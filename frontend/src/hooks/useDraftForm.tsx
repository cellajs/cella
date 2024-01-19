import { useEffect } from 'react';
import { FieldValues, Path, UseFormProps, UseFormReturn, useForm } from 'react-hook-form';
import { useDraftStore } from '~/store/draft';

function useFormWithDraft<
  TFieldValues extends FieldValues = FieldValues,
  // biome-ignore lint/suspicious/noExplicitAny: any is required here
  TContext = any,
  TTransformedValues extends FieldValues | undefined = undefined,
>(formId: string, props?: UseFormProps<TFieldValues, TContext>): UseFormReturn<TFieldValues, TContext, TTransformedValues> {
  const form = useForm<TFieldValues, TContext, TTransformedValues>(props);
  const getForm = useDraftStore((state) => state.getForm);
  const setForm = useDraftStore((state) => state.setForm);
  const resetForm = useDraftStore((state) => state.resetForm);

  useEffect(() => {
    const values = getForm<TFieldValues>(formId);
    if (values) {
      for (const key in values) {
        form.setValue(key as unknown as Path<TFieldValues>, values[key as keyof TFieldValues]);
      }
    }
  }, [form, getForm]);

  useEffect(() => {
    const subscription = form.watch((value) => {
      if (Object.keys(form.formState.dirtyFields).length === 0) {
        return resetForm(formId);
      }
      return setForm(formId, value);
    });
    return () => subscription.unsubscribe();
  }, [form.watch, setForm, resetForm, formId, form.formState.dirtyFields]);

  return {
    ...form,
    reset: (values, keepStateOptions) => {
      resetForm(formId);
      form.reset(values, keepStateOptions);
    },
  };
}

export default useFormWithDraft;
