import { type MouseEvent, Suspense, useRef, useState } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { zUpdateOrganizationBody } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import type { z } from 'zod';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { persistAttachments } from '~/modules/attachment/helpers/persist-attachments';
import { useCanUploadAttachments } from '~/modules/attachment/helpers/use-can-upload-attachments';
import { AddFilesButton } from '~/modules/common/blocknote/add-files-button';
import type { BlockNoteContentApi } from '~/modules/common/blocknote/blocknote-editor';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useFormWithDraft } from '~/modules/common/form-draft/use-form-with-draft';
import { CancelButton } from '~/modules/common/form-fields/cancel-button';
import { FormActions } from '~/modules/common/form-fields/form-actions';
import { LazyBlockNoteContentFormField } from '~/modules/common/form-fields/lazy-blocknote';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { openConfirm } from '~/modules/common/open-confirm';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { useOrganizationUpdateMutation } from '~/modules/organization/query';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { Form } from '~/modules/ui/field';
import { formResolver } from '~/utils/form-resolver';

const formSchema = zUpdateOrganizationBody;

type FormValues = z.infer<typeof formSchema>;

const toFormValues = (organization: Organization): FormValues => ({ welcomeText: organization.welcomeText ?? '' });

interface UpdateOrganizationDetailsFormProps {
  organization: EnrichedOrganization;
  callback?: (args: CallbackArgs<Organization>) => void;
}

export function UpdateOrganizationDetailsForm({ organization, callback }: UpdateOrganizationDetailsFormProps) {
  const { t } = useTranslation();
  const { mutate, isPending } = useOrganizationUpdateMutation();
  const canUpload = useCanUploadAttachments(organization);
  const editorApiRef = useRef<BlockNoteContentApi | null>(null);

  const formOptions: UseFormProps<FormValues> = { resolver: formResolver(formSchema), defaultValues: toFormValues(organization) };

  const formContainerId = 'update-organization-details';
  const form = useFormWithDraft<FormValues>(`${formContainerId}-${organization.id}`, { formOptions, formContainerId });

  useBeforeUnload(form.isDirty);

  // The editor reads its content once, at creation, so a reset remounts it to show the saved text again.
  const [editorKey, setEditorKey] = useState(0);

  const onSubmit = (changes: Partial<FormValues>) =>
    mutate(
      { path: { tenantId: organization.tenantId, organizationId: organization.id }, body: changes },
      {
        onSuccess: (updatedOrganization) => {
          form.reset(toFormValues(updatedOrganization));
          toaster.success(t('c:success.update_resource', { resource: t('c:organization') }));
          callback?.({ data: updatedOrganization, status: 'success' });
        },
      },
    );

  const discardChanges = () => {
    form.reset();
    setEditorKey((key) => key + 1);
  };

  // Discarding drops the unsaved text for good, so the click asks first.
  const openDiscardConfirm = (event: MouseEvent<HTMLButtonElement>) =>
    openConfirm(event.currentTarget, {
      id: `discard-organization-details-${organization.id}`,
      title: t('c:confirm.discard_changes'),
      label: 'c:discard',
      cancelLabel: 'c:keep_editing',
      allowOffline: true,
      align: 'start',
      onConfirm: discardChanges,
    });

  if (form.loading) return null;

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleChanges(onSubmit)} className="flex flex-col gap-6">
        {/* The loaded field's height with one paragraph: a taller fallback would shrink and pull a section a hash jumped to under the page tabs */}
        <Suspense
          fallback={
            <div className="flex h-27 flex-col justify-center">
              <Spinner noDelay />
            </div>
          }
        >
          <LazyBlockNoteContentFormField
            key={editorKey}
            control={form.control}
            name="welcomeText"
            label={t('c:introduction')}
            contentApiRef={editorApiRef}
            baseBlockNoteProps={{
              id: `${appConfig.name}-blocknote-welcome`,
              trailingBlock: false,
              excludeBlockTypes: ['checklistItem', 'notify'],
              className: 'max-h-[50vh] overflow-auto',
              media: {
                tenantId: organization.tenantId,
                organizationId: organization.id,
                // Private org-scoped attachments so the id the block references resolves via presigned + permission check.
                upload: canUpload
                  ? {
                      mediaMode: 'private-attachment',
                      persist: (attachments) => persistAttachments(attachments, { tenantId: organization.tenantId, organizationId: organization.id }),
                    }
                  : undefined,
              },
            }}
          />
        </Suspense>

        <FormActions>
          <SubmitButton disabled={!form.isDirty} loading={isPending}>
            {t('c:save_changes')}
          </SubmitButton>
          <CancelButton type="button" dirty={form.isDirty} onClick={openDiscardConfirm} />
          {canUpload && <AddFilesButton apiRef={editorApiRef} className="ml-auto" />}
        </FormActions>
      </form>
    </Form>
  );
}
