import { type MouseEvent, Suspense, useState } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { zUpdateOrganizationBody } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import type { z } from 'zod';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { canUploadAttachments } from '~/modules/attachment/helpers/can-upload-attachments';
import { persistAttachments } from '~/modules/attachment/helpers/persist-attachments';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { CancelButton } from '~/modules/common/form-fields/cancel-button';
import { blockNoteFieldClass, LazyBlockNoteContentFormField } from '~/modules/common/form-fields/lazy-blocknote';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { openConfirm } from '~/modules/common/open-confirm';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { useOrganizationUpdateMutation } from '~/modules/organization/query';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { Form } from '~/modules/ui/field';
import { cn } from '~/utils/cn';
import { formResolver } from '~/utils/form-resolver';

const formSchema = zUpdateOrganizationBody;

type FormValues = z.infer<typeof formSchema>;

interface UpdateOrganizationDetailsFormProps {
  organization: EnrichedOrganization;
  callback?: (args: CallbackArgs<Organization>) => void;
}

export function UpdateOrganizationDetailsForm({ organization, callback }: UpdateOrganizationDetailsFormProps) {
  const { t } = useTranslation();
  const { mutate, isPending } = useOrganizationUpdateMutation();

  const formOptions: UseFormProps<FormValues> = {
    resolver: formResolver(formSchema),
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
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <Suspense fallback={<Spinner className="my-16" noDelay />}>
          <LazyBlockNoteContentFormField
            key={editorKey}
            control={form.control}
            name="welcomeText"
            label={t('c:introduction')}
            baseBlockNoteProps={{
              id: `${appConfig.name}-blocknote-welcome`,
              trailingBlock: false,
              className: cn(blockNoteFieldClass, 'max-h-[50vh] overflow-auto bg-background pl-8'),
              baseFilePanelProps: canUploadAttachments(organization)
                ? {
                    mediaMode: 'private-attachment',
                    tenantId: organization.tenantId,
                    organizationId: organization.id,
                    // Private org-scoped attachments so the id the block references resolves via presigned + permission check.
                    onComplete: (attachments) =>
                      persistAttachments(attachments, { tenantId: organization.tenantId, organizationId: organization.id }),
                  }
                : undefined,
            }}
          />
        </Suspense>

        <div className="flex flex-col gap-2 sm:flex-row">
          <SubmitButton disabled={!form.isDirty} loading={isPending}>
            {t('c:save_changes')}
          </SubmitButton>
          <CancelButton type="button" dirty={form.isDirty} onClick={openDiscardConfirm} />
        </div>
      </form>
    </Form>
  );
}
