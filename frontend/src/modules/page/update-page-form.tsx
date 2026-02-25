import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Check, EyeIcon, Loader2 } from 'lucide-react';
import { lazy, Suspense, useCallback, useState } from 'react';
import type { Control, FieldValues, UseFormProps } from 'react-hook-form';
import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { z } from 'zod';
import type { Page } from '~/api.gen';
import { useAutoSave } from '~/hooks/use-auto-save';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { InputFormField } from '~/modules/common/form-fields/input';
import { Spinner } from '~/modules/common/spinner';
import { StickyBox } from '~/modules/common/sticky-box';
import { pageQueryKeys, usePageUpdateMutation } from '~/modules/page/query';
import { Button } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';

const BlockNoteContentField = lazy(() => import('~/modules/common/form-fields/blocknote-content'));

// Form schema for name/description editing
const formSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000000),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  page: Page;
}

export function UpdatePageForm({ page }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const updatePage = usePageUpdateMutation();

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

  // Save a single field via mutation
  const saveField = useCallback(
    (key: 'name' | 'description', value: string) => {
      setSaveStatus('saving');
      updatePage.mutate(
        { id: page.id, key, data: value },
        {
          onSuccess: () => {
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 1000);
          },
          onError: () => setSaveStatus('idle'),
        },
      );
      // For offline: optimistic update happens in onMutate
      if (updatePage.isPaused) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1000);
      }
    },
    [page.id, updatePage],
  );

  // Per-field auto-save: description (time-based since users type continuously)
  const descriptionValue = watchedValues.description ?? page.description ?? '';
  const { hasUnsavedChanges: descriptionUnsaved } = useAutoSave({
    data: descriptionValue,
    hasChanges: (val) => val !== (page.description ?? ''),
    onSave: (val) => saveField('description', val),
    inactivityDelay: 5000,
    maxDelay: 30000,
    enabled: !form.loading,
  });

  const nameUnsaved = (watchedValues.name ?? page.name) !== page.name;
  const hasUnsavedChanges = nameUnsaved || descriptionUnsaved;

  // Prevent data loss on navigation
  useBeforeUnload(hasUnsavedChanges);

  if (form.loading) return null;

  return (
    <>
      <StickyBox className="z-10 bg-background" offsetTop={0} hideOnScrollDown>
        <div className="flex items-center justify-between gap-3 py-3 sm:py-6">
          <div className="flex items-center gap-2">
            <Button
              variant="plain"
              onClick={() => {
                // Update detail cache with current form values before navigating
                // so the view page shows the latest content immediately
                const currentData = form.getValues();
                queryClient.setQueryData(pageQueryKeys.detail.byId(page.id), {
                  ...page,
                  ...currentData,
                  modifiedAt: new Date().toISOString(),
                });
                navigate({ to: '/docs/page/$id', params: { id: page.id } });
              }}
            >
              <EyeIcon size={16} className="mr-2" />
              {t('common:view')}
            </Button>
          </div>
          <div>
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
        </div>
      </StickyBox>

      <Form {...form}>
        <form className="space-y-6 [&_label]:hidden">
          <InputFormField
            inputClassName="h-14 text-4xl font-bold border-0 p-0 focus:ring-0 focus:ring-offset-0 shadow-none"
            control={form.control as unknown as Control<FieldValues>}
            name="name"
            label={t('common:title')}
            required
            onBlur={() => {
              const val = form.getValues('name');
              if (val !== page.name) saveField('name', val);
            }}
          />

          <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" noDelay />}>
            <BlockNoteContentField
              control={form.control as unknown as Control<FieldValues>}
              name="description"
              autoFocus
              baseBlockNoteProps={{
                id: `${appConfig.name}-blocknote-page-${page.id}`,
                trailingBlock: false,
                className:
                  'min-h-[50vh] bg-background focus-visible:ring-ring max-focus-visible:ring-transparent max-focus-visible:ring-offset-0 flex w-full text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-hidden sm:focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                baseFilePanelProps: { isPublic: true, tenantId: 'public', organizationId: 'page' },
              }}
            />
          </Suspense>
        </form>
      </Form>
    </>
  );
}
