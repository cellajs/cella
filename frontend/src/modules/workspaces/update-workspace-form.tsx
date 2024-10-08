import { zodResolver } from '@hookform/resolvers/zod';
import { type DefaultError, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import type { Workspace } from '~/types/app';

import { updateWorkspaceBodySchema } from 'backend/modules/workspaces/schema';
import { isValidElement, useEffect } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { toast } from 'sonner';
import { type UpdateWorkspaceParams, updateWorkspace } from '~/api/workspaces';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { dialog } from '~/modules/common/dialoger/state';
import AvatarFormField from '~/modules/common/form-fields/avatar';
import InputFormField from '~/modules/common/form-fields/input';
import SelectParentFormField from '~/modules/common/form-fields/select-parent';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import { sheet } from '~/modules/common/sheeter/state';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import { Button } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';
import { cleanUrl } from '~/utils/clean-url';

interface Props {
  workspace: Workspace;
  callback?: (workspace: Workspace) => void;
  dialog?: boolean;
  sheet?: boolean;
}

const formSchema = updateWorkspaceBodySchema;

type FormValues = z.infer<typeof formSchema>;

export const useUpdateWorkspaceMutation = (idOrSlug: string, orgIdOrSlug: string) => {
  return useMutation<Workspace, DefaultError, UpdateWorkspaceParams>({
    mutationKey: ['workspaces', 'update', idOrSlug],
    mutationFn: (params) => updateWorkspace(idOrSlug, orgIdOrSlug, params),
    gcTime: 1000 * 10,
  });
};

const UpdateWorkspaceForm = ({ workspace, callback, dialog: isDialog, sheet: isSheet }: Props) => {
  const { t } = useTranslation();

  const { mutate, isPending } = useUpdateWorkspaceMutation(workspace.id, workspace.organizationId);

  const formOptions: UseFormProps<FormValues> = {
    resolver: zodResolver(formSchema),
    defaultValues: {
      slug: workspace.slug,
      name: workspace.name,
      thumbnailUrl: cleanUrl(workspace.thumbnailUrl),
      organizationId: workspace.organizationId,
    },
  };

  const form = useFormWithDraft<FormValues>(`update-workspace-${workspace.id}`, formOptions);

  // Prevent data loss
  useBeforeUnload(form.formState.isDirty);
  const setImageUrl = (url: string) => {
    form.setValue('thumbnailUrl', url, { shouldDirty: true });
  };

  const onSubmit = (values: FormValues) => {
    mutate(values, {
      onSuccess: (updatedWorkspace) => {
        if (isDialog) dialog.remove();
        if (isSheet) sheet.remove('edit-workspace');
        form.reset(updatedWorkspace);
        toast.success(t('common:success.update_resource', { resource: t('app:workspace') }));
        callback?.(updatedWorkspace);
      },
    });
  };

  // Update sheet title with unsaved changes
  useEffect(() => {
    if (!isSheet) return;
    if (form.unsavedChanges) {
      const targetSheet = sheet.get('update-user');

      if (!targetSheet || !isValidElement(targetSheet.title)) return;
      // Check if the title's type is a function (React component) and not a string
      const { type: tittleType } = targetSheet.title;

      if (typeof tittleType !== 'function' || tittleType.name === 'UnsavedBadge') return;
      sheet.update('update-user', {
        title: <UnsavedBadge title={targetSheet.title} />,
      });
    }
  }, [form.unsavedChanges]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <AvatarFormField
          control={form.control}
          label={t('common:resource_logo', { resource: t('qpp:workspace') })}
          type="workspace"
          name="thumbnailUrl"
          entity={workspace}
          url={form.getValues('thumbnailUrl')}
          setUrl={setImageUrl}
        />
        <InputFormField control={form.control} name="name" label={t('common:name')} required />
        <SlugFormField
          control={form.control}
          type="workspace"
          label={t('common:resource_handle', { resource: t('app:workspace') })}
          description={t('common:resource_handle.text', { resource: t('app:workspace').toLowerCase() })}
          previousSlug={workspace.slug}
        />
        <SelectParentFormField
          collection="organizations"
          type="organization"
          control={form.control}
          label={t('common:organization')}
          name="organizationId"
          disabled
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="submit" disabled={!form.formState.isDirty} loading={isPending}>
            {t('common:save_changes')}
          </Button>
          <Button
            type="reset"
            variant="secondary"
            onClick={() => {
              form.reset();
              sheet.update('edit-workspace', { title: t('common:resource_settings', { resource: t('app:workspace') }) });
            }}
            className={form.formState.isDirty ? '' : 'invisible'}
          >
            {t('common:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default UpdateWorkspaceForm;
