import { zodResolver } from '@hookform/resolvers/zod';
import { type MouseEvent, Suspense, useState } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { zUpdateOrganizationBody } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import type { z } from 'zod';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { persistAttachments } from '~/modules/attachment/helpers/persist-attachments';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import type { BlockNoteContentFormField as BlockNoteContentFormFieldType } from '~/modules/common/form-fields/blocknote';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { PopConfirm } from '~/modules/common/popconfirm';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { useOrganizationUpdateMutation } from '~/modules/organization/query';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { Button } from '~/modules/ui/button';
import { Form } from '~/modules/ui/field';
import { lazyNamed } from '~/utils/lazy-named';

const BlockNoteContentFormField = lazyNamed(
  () => import('~/modules/common/form-fields/blocknote'),
  'BlockNoteContentFormField',
) as unknown as typeof BlockNoteContentFormFieldType;

const formSchema = zUpdateOrganizationBody;

type FormValues = z.infer<typeof formSchema>;
interface Props {
  organization: EnrichedOrganization;
  sheet?: boolean;
  callback?: (args: CallbackArgs<Organization>) => void;
}

export function UpdateOrganizationDetailsForm({ organization, callback, sheet: isSheet }: Props) {
  const { t } = useTranslation();
  const { mutate, isPending } = useOrganizationUpdateMutation();

  // Inline media become org-scoped attachment rows, so the file panel needs attachment CREATE, which
  // an organization UPDATE grant does not imply, and the organization must be an upload target.
  const canUploadAttachments =
    (appConfig.attachmentUploadTargets as readonly string[]).includes('organization') && organization.can?.attachment?.create === true;

  const formOptions: UseFormProps<FormValues> = {
    resolver: zodResolver(formSchema),
    defaultValues: { welcomeText: organization.welcomeText || '' },
  };

  const formContainerId = 'update-organization-details';
  const form = useFormWithDraft<FormValues>(`${formContainerId}-${organization.id}`, { formOptions, formContainerId });

  useBeforeUnload(form.isDirty);

  // The editor reads its content once, at creation, so a reset remounts it to show the saved text again.
  const [editorKey, setEditorKey] = useState(0);

  const onSubmit = (body: FormValues) => {
    mutate(
      { path: { tenantId: organization.tenantId, id: organization.id }, body },
      {
        onSuccess: (updatedOrganization) => {
          if (isSheet) useSheeter.getState().remove(formContainerId);
          form.reset(body);
          toaster.success(t('c:success.update_resource', { resource: t('c:organization') }));
          callback?.({ data: updatedOrganization, status: 'success' });
        },
      },
    );
  };

  const discardChanges = () => {
    form.reset();
    setEditorKey((key) => key + 1);
  };

  // Discarding drops the unsaved text for good, so the click asks first.
  const openDiscardConfirm = (event: MouseEvent<HTMLButtonElement>) => {
    const { create, remove } = useDropdowner.getState();
    create(
      <PopConfirm title={t('c:confirm.discard_changes')}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="destructive"
            className="justify-center sm:w-auto"
            onClick={() => {
              remove();
              discardChanges();
            }}
          >
            {t('c:discard')}
          </Button>
          <Button variant="secondary" data-autofocus onClick={() => remove()}>
            {t('c:keep_editing')}
          </Button>
        </div>
      </PopConfirm>,
      {
        id: 'discard-organization-details',
        triggerId: `discard-organization-details-${organization.id}`,
        triggerRef: { current: event.currentTarget },
      },
    );
  };

  if (form.loading) return null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <Suspense fallback={<Spinner className="my-16 size-6 opacity-50" noDelay />}>
          <BlockNoteContentFormField
            key={editorKey}
            control={form.control}
            name="welcomeText"
            label={t('c:introduction')}
            baseBlockNoteProps={{
              id: `${appConfig.name}-blocknote-welcome`,
              trailingBlock: false,
              className:
                'min-h-20 max-h-[50vh] overflow-auto bg-background p-3 pr-6 pl-8 border-input ring-offset-background focus-visible:ring-ring w-full rounded-md border text-sm focus-visible:outline-hidden focus-ring:focus-visible:ring-2 focus-visible:ring-offset-2',
              baseFilePanelProps: canUploadAttachments
                ? {
                    mediaMode: 'private-attachment',
                    tenantId: organization.tenantId,
                    organizationId: organization.id,
                    // Private org-scoped attachments so the id the block references resolves via presigned + permission check.
                    onComplete: (attachments) =>
                      persistAttachments(attachments, { tenantId: organization.tenantId, organizationId: organization.id }).catch(() => {
                        toaster.error(t('error:create_resource', { resource: t('c:attachment').toLowerCase() }));
                      }),
                  }
                : undefined,
            }}
          />
        </Suspense>

        <div className="flex flex-col gap-2 sm:flex-row">
          <SubmitButton disabled={!form.isDirty} loading={isPending}>
            {t('c:save_changes')}
          </SubmitButton>
          <Button variant="secondary" onClick={openDiscardConfirm} className={form.isDirty ? '' : 'invisible'}>
            {t('c:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
