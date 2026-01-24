import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { type UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { zCreatePageData } from '~/api.gen/zod.gen';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import InputFormField from '~/modules/common/form-fields/input';
import { usePageCreateMutation } from '~/modules/page/query';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';

interface Props {
  callback?: () => void;
}

// Form only collects the data portion - tx is added by mutation
const formSchema = zCreatePageData.shape.body.shape.data;
type FormValues = z.infer<typeof formSchema>;

export const CreatePageForm = ({ callback }: Props) => {
  const { t } = useTranslation();
  const createPage = usePageCreateMutation();

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

  const onSubmit = async (values: FormValues) => {
    await createPage.mutateAsync(values);
    form.reset();
    callback?.();
  };

  return (
    <Form {...form} labelDirection="top">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <InputFormField control={form.control} name="name" label={t('common:title')} required />

        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton allowOfflineDelete disabled={!form.isDirty || createPage.isPending}>
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
