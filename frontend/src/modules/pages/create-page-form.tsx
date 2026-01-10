import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { type UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import type { Page } from '~/api.gen';
import { zCreatePageData } from '~/api.gen/zod.gen';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import InputFormField from '~/modules/common/form-fields/input';
import type { initPagesCollection } from '~/modules/pages/collections';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';
import { useUserStore } from '~/store/user';
import { nanoid } from '~/utils/nanoid';

interface Props {
  pagesCollection: ReturnType<typeof initPagesCollection>;
  callback?: () => void;
}

const formSchema = zCreatePageData.shape.body;
type FormValues = z.infer<typeof formSchema>;

export const CreatePageForm = ({ pagesCollection, callback }: Props) => {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);

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

  const onSubmit = (values: FormValues) => {
    // Create page with all required fields for optimistic insert
    const newPage: Page = {
      id: nanoid(),
      entityType: 'page',
      name: values.name ?? '',
      description: '',
      keywords: '',
      status: 'unpublished',
      parentId: null,
      displayOrder: 0,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      modifiedAt: null,
      modifiedBy: null,
    };

    // Use collection for optimistic insert - syncs automatically via onInsert callback
    pagesCollection.insert(newPage);
    form.reset();
    callback?.();
  };

  return (
    <Form {...form} labelDirection="top">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <InputFormField control={form.control} name="name" label={t('common:title')} required />

        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton disabled={!form.isDirty}>{t('common:create')}</SubmitButton>

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
