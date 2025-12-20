import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { type UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import type { Page } from '~/api.gen';
import { zCreatePageData } from '~/api.gen/zod.gen';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { CallbackArgs } from '~/modules/common/data-table/types';
import InputFormField from '~/modules/common/form-fields/input';
import { toaster } from '~/modules/common/toaster/service';
import { usePageCreateMutation } from '~/modules/pages/query';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';

interface Props {
  callback?: (args: CallbackArgs<Page>) => void;
}

const formSchema = zCreatePageData.shape.body;
type FormValues = z.infer<typeof formSchema>;

export const CreatePageForm = ({ callback }: Props) => {
  const { t } = useTranslation();

  const defaultValues = { name: '' };

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues,
    }),
    [],
  );

  const formContainerId = 'create-page';
  const form = useFormWithDraft<FormValues>(formContainerId, { formOptions });

  const { mutate, isPending } = usePageCreateMutation();

  const onSubmit = (values: FormValues) => {
    mutate(values, {
      onSuccess: (createdPage) => {
        form.reset();
        toaster(t('common:success.create_resource', { resource: t('common:page') }), 'success');
        callback?.({ data: createdPage, status: 'success' }); // Trigger callback
      },
    });
  };

  return (
    <Form {...form} labelDirection="top">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <InputFormField control={form.control} name="name" label={t('common:title')} required />

        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton disabled={!form.isDirty} loading={isPending}>
            {t('common:create')}
          </SubmitButton>

          <Button
            type="reset"
            variant="secondary"
            className={form.isDirty ? '' : 'invisible'}
            aria-label="Cancel"
            onClick={() => form.reset()}
          >
            {t('common:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
};
