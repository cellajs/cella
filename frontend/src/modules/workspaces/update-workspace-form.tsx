import { zodResolver } from '@hookform/resolvers/zod';
import { type DefaultError, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import type { Workspace } from '~/types';

import type { UseFormProps } from 'react-hook-form';
import { toast } from 'sonner';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { queryClient } from '~/lib/router';
import { dialog } from '~/modules/common/dialoger/state';
import { sheet, isSheet as checkSheet } from '~/modules/common/sheeter/state';
import { Button } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';
import InputFormField from '../common/form-fields/input';
import { SlugFormField } from '../common/form-fields/slug';
import { updateWorkspaceJsonSchema } from 'backend/modules/workspaces/schema';
import { type UpdateWorkspaceParams, updateWorkspace } from '~/api/workspaces';
import SelectParentFormField from '../common/form-fields/select-parent';
import { useEffect } from 'react';
import UnsavedBadge from '../common/unsaved-badge';

interface Props {
  workspace: Workspace;
  callback?: (workspace: Workspace) => void;
  dialog?: boolean;
  sheet?: boolean;
}

const formSchema = updateWorkspaceJsonSchema;

type FormValues = z.infer<typeof formSchema>;

export const useUpdateWorkspaceMutation = (idOrSlug: string) => {
  return useMutation<Workspace, DefaultError, UpdateWorkspaceParams>({
    mutationKey: ['workspace', 'update', idOrSlug],
    mutationFn: (params) => updateWorkspace(idOrSlug, params),
    onSuccess: (workspace) => {
      queryClient.setQueryData(['workspace', idOrSlug], workspace);
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
      organizationId: workspace.organizationId,
    },
  };

  const form = useFormWithDraft<FormValues>(`update-workspace-${workspace.id}`, formOptions);

  // Prevent data loss
  useBeforeUnload(form.formState.isDirty);

  const onSubmit = (values: FormValues) => {
    mutate(values, {
      onSuccess: (data) => {
        callback?.(data);
        if (isDialog) dialog.remove();
        toast.success(t('common:success.update_workspace'));
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
          required
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
