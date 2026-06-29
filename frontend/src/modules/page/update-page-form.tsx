import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Check, EyeIcon, Loader2 } from 'lucide-react';
import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import type { Control, FieldValues, UseFormProps } from 'react-hook-form';
import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Page } from 'sdk';
import { appConfig } from 'shared';
import { z } from 'zod';
import { useAutoSave } from '~/hooks/use-auto-save';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { useYjsConnection } from '~/modules/common/blocknote/yjs-connections';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { InputFormField } from '~/modules/common/form-fields/input';
import { Spinner } from '~/modules/common/spinner';
import { StickyBox } from '~/modules/common/sticky-box';
import { pageQueryKeys, usePageUpdateMutation } from '~/modules/page/query';
import { RenderModeLabel } from '~/modules/page/utils/render-mode';
import { Button } from '~/modules/ui/button';
import { Form } from '~/modules/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger } from '~/modules/ui/select';
import { useUserStore, yjsTokenKey } from '~/modules/user/user-store';
import { getRandomColor } from '~/utils/random-color';

const BlockNoteContentFormField = lazy(() => import('~/modules/common/form-fields/blocknote'));
const BlockNote = lazy(() => import('~/modules/common/blocknote/block-note-editor'));

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
  const user = useUserStore((s) => s.user);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [renderMode, setRenderMode] = useState<Page['renderMode']>(page.renderMode ?? 'default');
  const updatePage = usePageUpdateMutation();

  const renderModeLabels: Record<NonNullable<Page['renderMode']>, string> = {
    default: t('c:render_mode.default'),
    overview: t('c:render_mode.overview'),
    nodeOnly: t('c:render_mode.node_only'),
  };

  // Collaborative editing via Yjs relay when yjsUrl is configured (skip when offline)
  const yjsToken = useUserStore((s) => s.yjsTokens[yjsTokenKey('page', '')]);
  const isOnline = useOnlineManager();
  const useCollaborative = !!appConfig.yjsUrl && isOnline && !!yjsToken;

  // Connection manager: ref-counted Y.Doc + WebsocketProvider
  const yjsConn = useYjsConnection(useCollaborative ? page.id : undefined, 'page', '');

  // Stable random color for cursor labels
  const userColorRef = useRef(getRandomColor());

  const collaborationConfig = yjsConn
    ? {
        provider: yjsConn.provider,
        fragment: yjsConn.fragment,
        user: { name: user.name, color: userColorRef.current },
        showCursorLabels: 'activity' as const,
      }
    : undefined;

  // Collaborative derived-fields callback: fires the React Query mutation
  const sendDerivedUpdate = async (id: string, description: string) => {
    updatePage.mutate({ id, ops: { description } });
  };

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
        { id: page.id, ops: { [key]: value } },
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

  // Per-field auto-save: description — only in non-collaborative mode.
  // In collaborative mode, useDerivedFieldsSender (inside BlockNote) handles persistence.
  const descriptionValue = watchedValues.description ?? page.description ?? '';
  const { hasUnsavedChanges: descriptionUnsaved } = useAutoSave({
    data: descriptionValue,
    hasChanges: (val) => val !== (page.description ?? ''),
    onSave: (val) => saveField('description', val),
    inactivityDelay: 5000,
    maxDelay: 30000,
    enabled: !form.loading && !useCollaborative,
  });

  const nameUnsaved = (watchedValues.name ?? page.name) !== page.name;
  const hasUnsavedChanges = nameUnsaved || descriptionUnsaved;

  // Prevent data loss on navigation
  useBeforeUnload(hasUnsavedChanges);

  const blockNoteClassName =
    'min-h-[50vh] bg-background focus-visible:ring-ring max-focus-visible:ring-transparent max-focus-visible:ring-offset-0 w-full text-sm focus-visible:outline-hidden sm:focus-visible:ring-2 focus-visible:ring-offset-2';

  if (form.loading) return null;

  return (
    <>
      <StickyBox className="z-10 bg-background/60 backdrop-blur-xs" hideWhenOutOfView>
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
                  updatedAt: new Date().toISOString(),
                });
                navigate({ to: '/docs/page/$id', params: { id: page.id } });
              }}
            >
              <EyeIcon size={16} className="mr-2" />
              {t('c:view')}
            </Button>
            <Select
              value={renderMode}
              onValueChange={(value: string) => {
                const mode = value as Page['renderMode'];
                setRenderMode(mode);
                updatePage.mutate({ id: page.id, ops: { renderMode: mode } });
              }}
            >
              <SelectTrigger render={<Button variant="outline" size="xs" className="gap-1.5 text-xs" />}>
                <RenderModeLabel mode={renderMode ?? 'default'} label={renderModeLabels[renderMode ?? 'default']} />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="default">
                  <RenderModeLabel mode="default" label={renderModeLabels.default} />
                </SelectItem>
                <SelectItem value="overview">
                  <RenderModeLabel mode="overview" label={renderModeLabels.overview} />
                </SelectItem>
                <SelectItem value="nodeOnly">
                  <RenderModeLabel mode="nodeOnly" label={renderModeLabels.nodeOnly} />
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('c:saving')}
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1.5 text-success">
                <Check className="h-3.5 w-3.5" />
                {t('c:saved')}
              </span>
            )}
            {saveStatus === 'idle' && hasUnsavedChanges && (
              <span className="text-muted-foreground/60">{t('c:unsaved_changes')}</span>
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
            label={t('c:title')}
            required
            onBlur={() => {
              const val = form.getValues('name');
              if (val !== page.name) saveField('name', val);
            }}
          />

          <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" noDelay />}>
            {renderMode === 'nodeOnly' ? (
              <p className="py-8 text-muted-foreground text-sm">
                {t('c:render_mode.node_only')}: {t('c:no_child_pages')}
              </p>
            ) : useCollaborative && collaborationConfig ? (
              <BlockNote
                id={`${appConfig.name}-blocknote-page-${page.id}`}
                autoFocus
                defaultValue={page.description ?? undefined}
                className={blockNoteClassName}
                trailingBlock={false}
                updateData={() => {}}
                baseFilePanelProps={{ isPublic: true, organizationId: 'page' }}
                collaboration={collaborationConfig}
                entityType="page"
                entityId={page.id}
                sendDerivedUpdate={sendDerivedUpdate}
              />
            ) : (
              <BlockNoteContentFormField
                control={form.control as unknown as Control<FieldValues>}
                name="description"
                autoFocus
                baseBlockNoteProps={{
                  id: `${appConfig.name}-blocknote-page-${page.id}`,
                  trailingBlock: false,
                  className: blockNoteClassName,
                  baseFilePanelProps: { isPublic: true, organizationId: 'page' },
                }}
              />
            )}
          </Suspense>
        </form>
      </Form>
    </>
  );
}
