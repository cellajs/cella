import { zodResolver } from '@hookform/resolvers/zod';
import { type DefaultError, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import type { Workspace } from '~/types';

import { updateWorkspaceBodySchema } from 'backend/modules/workspaces/schema';
import { useEffect } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { toast } from 'sonner';
import { type UpdateWorkspaceParams, updateWorkspace } from '~/api/workspaces';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { queryClient } from '~/lib/router';
import { dialog } from '~/modules/common/dialoger/state';
import { isSheet as checkSheet, sheet } from '~/modules/common/sheeter/state';
import { Button } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';
import InputFormField from '../common/form-fields/input';
import SelectParentFormField from '../common/form-fields/select-parent';
import { SlugFormField } from '../common/form-fields/slug';
import UnsavedBadge from '../common/unsaved-badge';
import { cleanUrl } from '~/lib/utils';
import AvatarFormField from '~/modules/common/form-fields/avatar';

interface Props {
  workspace: Workspace;
  callback?: (workspace: Workspace) => void;
  dialog?: boolean;
  sheet?: boolean;
}

const formSchema = updateWorkspaceBodySchema;

type FormValues = z.infer<typeof formSchema>;

export const useUpdateWorkspaceMutation = (idOrSlug: string) => {
  return useMutation<Workspace, DefaultError, UpdateWorkspaceParams>({
    mutationKey: ['workspaces', 'update', idOrSlug],
    mutationFn: (params) => updateWorkspace(idOrSlug, params),
    onSuccess: (updatedWorkspace) => {
      queryClient.setQueryData(['workspaces', idOrSlug], updatedWorkspace);
      queryClient.invalidateQueries({
        queryKey: ['workspaces'],
      });
    },
    gcTime: 1000 * 10,
  });
};

const UpdateWorkspaceForm = ({ workspace, callback, dialog: isDialog, sheet: isSheet }: Props) => {
  const { t } = useTranslation();

  const { mutate, isPending } = useUpdateWorkspaceMutation(workspace.id);

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
        callback?.(updatedWorkspace);
        if (isDialog) dialog.remove();
        if (isSheet) sheet.remove('edit-workspace');
        form.reset(updatedWorkspace);
        toast.success(t('common:success.update_resource', { resource: t('common:workspace') }));
      },
    });
  };

  // Update sheet title with unsaved changes
  useEffect(() => {
    if (!isSheet) return;
    if (form.unsavedChanges) {
      const targetSheet = sheet.get('edit-workspace');
      if (targetSheet && checkSheet(targetSheet)) {
        sheet.update('edit-workspace', {
          title: <UnsavedBadge title={targetSheet?.title} />,
        });
        return;
      }
    }
    sheet.reset('edit-workspace');
  }, [form.unsavedChanges]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <AvatarFormField
          control={form.control}
          label={t('common:workspace_logo')}
          type="WORKSPACE"
          name="thumbnailUrl"
          entity={workspace}
          url={form.getValues('thumbnailUrl')}
          setUrl={setImageUrl}
        />
        <InputFormField control={form.control} name="name" label={t('common:name')} required />
        <SlugFormField
          control={form.control}
          type="WORKSPACE"
          label={t('common:workspace_handle')}
          description={t('common:workspace_handle.text')}
          previousSlug={workspace.slug}
        />
        <SelectParentFormField
          collection="organizations"
          type="ORGANIZATION"
          control={form.control}
          label={t('common:organization')}
          name="organizationId"
          disabled
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="submit" disabled={!form.formState.isDirty} loading={isPending}>
            {t('common:save_changes')}
          </Button>
          <Button type="reset" variant="secondary" onClick={() => form.reset()} className={form.formState.isDirty ? '' : 'invisible'}>
            {t('common:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default UpdateWorkspaceForm;
