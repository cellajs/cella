import { zodResolver } from '@hookform/resolvers/zod';
import { appConfig } from 'config';
import { lazy, Suspense } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import type { Page } from '~/api.gen';
import { zUpdatePageData } from '~/api.gen/zod.gen';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { CallbackArgs } from '~/modules/common/data-table/types';
import InputFormField from '~/modules/common/form-fields/input';
import Spinner from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/service';
import { usePageUpdateMutation } from '~/modules/pages/query';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';
import { blocknoteFieldIsDirty } from '~/utils/blocknote-field-is-dirty';

const BlockNoteContent = lazy(() => import('~/modules/common/form-fields/blocknote-content'));

const formSchema = zUpdatePageData.shape.body;

type FormValues = z.infer<typeof formSchema>;

interface Props {
  page: Page;
  callback?: (args: CallbackArgs<Page>) => void;
}

const UpdatePageForm = ({ page, callback }: Props) => {
  const { t } = useTranslation();
  const { mutate, isPending } = usePageUpdateMutation();

  const formOptions: UseFormProps<FormValues> = {
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: page.name,
      description: page.description || '',
    },
  };

  const formContainerId = 'update-page';
  const form = useFormWithDraft<FormValues>(`${formContainerId}-${page.id}`, { formOptions, formContainerId });

  // Prevent data loss
  useBeforeUnload(form.isDirty);

  const onSubmit = (body: FormValues) => {
    mutate(
      { id: page.id, body },
      {
        onSuccess: (updatedPage) => {
          form.reset(body);
          toaster(t('common:success.update_resource', { resource: t('common:page') }), 'success');
          callback?.({ data: updatedPage, status: 'success' });
        },
      },
    );
  };

  const isDirty = () => {
    if (!form.isDirty) return false;
    const { name, description } = form.getValues();
    const nameChanged = name !== page.name;
    const descriptionChanged = typeof description === 'string' && blocknoteFieldIsDirty(description);
    return nameChanged || descriptionChanged;
  };

  if (form.loading) return null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <InputFormField
          inputClassName="h-14 text-lg font-semibold"
          control={form.control}
          name="name"
          label={t('common:title')}
          required
        />

        <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" noDelay />}>
          <BlockNoteContent
            control={form.control}
            name="description"
            baseBlockNoteProps={{
              id: `${appConfig.name}-blocknote-page-${page.id}`,
              trailingBlock: false,
              className:
                'min-h-20 max-h-[50vh] overflow-auto bg-background pl-10 pr-6 p-3 border-input ring-offset-background focus-visible:ring-ring max-focus-visible:ring-transparent max-focus-visible:ring-offset-0 flex w-full rounded-md border text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-hidden sm:focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              baseFilePanelProps: { isPublic: true, organizationId: 'page' },
            }}
          />
        </Suspense>

        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton disabled={!isDirty()} loading={isPending}>
            {t('common:save_changes')}
          </SubmitButton>
          <Button
            type="reset"
            variant="secondary"
            onClick={() => form.reset()}
            className={isDirty() ? '' : 'invisible'}
          >
            {t('common:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default UpdatePageForm;
