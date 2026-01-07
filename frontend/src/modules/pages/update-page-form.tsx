import { zodResolver } from '@hookform/resolvers/zod';
import { appConfig } from 'config';
import { Check, Loader2 } from 'lucide-react';
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import type { Page } from '~/api.gen';
import { zUpdatePageData } from '~/api.gen/zod.gen';
import { useAutoSave } from '~/hooks/use-auto-save';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import InputFormField from '~/modules/common/form-fields/input';
import Spinner from '~/modules/common/spinner';
import type { initPagesCollection } from '~/modules/pages/collections';
import { Form } from '~/modules/ui/form';

const BlockNoteContentField = lazy(() => import('~/modules/common/form-fields/blocknote-content'));

const formSchema = zUpdatePageData.shape.body;

type FormValues = z.infer<typeof formSchema>;

interface Props {
  page: Page;
  pagesCollection: ReturnType<typeof initPagesCollection>;
}

const UpdatePageForm = ({ page, pagesCollection }: Props) => {
  const { t } = useTranslation();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const formOptions: UseFormProps<FormValues> = {
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: page.name,
      description: page.description || '',
    },
  };

  const formContainerId = 'update-page';
  const form = useFormWithDraft<FormValues>(`${formContainerId}-${page.id}`, { formOptions, formContainerId });

  // Watch form values for auto-save
  const watchedValues = useWatch({ control: form.control });

  // Memoize form data for auto-save
  const formData = useMemo(
    () => ({
      name: watchedValues.name ?? page.name,
      description: watchedValues.description ?? page.description ?? '',
    }),
    [watchedValues.name, watchedValues.description, page.name, page.description],
  );

  // Check if form has actual changes compared to original page
  const hasChanges = useCallback(
    (data: FormValues): boolean => {
      const nameChanged = data.name !== page.name;
      const descriptionChanged = data.description !== page.description;
      return nameChanged || descriptionChanged;
    },
    [page.name, page.description],
  );

  // Save handler using collection
  const handleSave = useCallback(
    async (data: FormValues) => {
      setSaveStatus('saving');
      try {
        pagesCollection.update(page.id, (draft) => {
          if (data.name !== undefined) draft.name = data.name;
          if (data.description !== undefined) draft.description = data.description;
        });
        form.reset(data);
        setSaveStatus('saved');
        // Reset to idle after showing "saved" indicator
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
      }
    },
    [page.id, pagesCollection, form],
  );

  // Auto-save with 5s inactivity delay and 30s max delay
  const { hasUnsavedChanges } = useAutoSave({
    data: formData,
    hasChanges,
    onSave: handleSave,
    inactivityDelay: 5000,
    maxDelay: 30000,
    enabled: !form.loading,
  });

  // Prevent data loss on navigation
  useBeforeUnload(hasUnsavedChanges);

  if (form.loading) return null;

  return (
    <Form {...form}>
      <form className="space-y-6 [&_label]:hidden">
        {/* Auto-save status indicator */}
        <div className="flex items-center justify-end h-6 text-sm text-muted-foreground">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('common:saving')}
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1.5 text-success">
              <Check className="h-3.5 w-3.5" />
              {t('common:saved')}
            </span>
          )}
          {saveStatus === 'idle' && hasUnsavedChanges && (
            <span className="text-muted-foreground/60">{t('common:unsaved_changes')}</span>
          )}
        </div>

        <InputFormField
          inputClassName="h-14 text-4xl font-bold border-0 p-0 focus:ring-0 focus:ring-offset-0 shadow-none"
          control={form.control}
          name="name"
          label={t('common:title')}
          required
        />

        <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" noDelay />}>
          <BlockNoteContentField
            control={form.control}
            name="description"
            autoFocus
            baseBlockNoteProps={{
              id: `${appConfig.name}-blocknote-page-${page.id}`,
              trailingBlock: false,
              className:
                'min-h-20 max-h-[50vh] overflow-auto bg-background focus-visible:ring-ring max-focus-visible:ring-transparent max-focus-visible:ring-offset-0 flex w-full text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-hidden sm:focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              baseFilePanelProps: { isPublic: true, organizationId: 'page' },
            }}
          />
        </Suspense>
      </form>
    </Form>
  );
};

export default UpdatePageForm;
