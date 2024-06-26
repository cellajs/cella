import { zodResolver } from '@hookform/resolvers/zod';
import { type DefaultError, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { useEffect } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { toast } from 'sonner';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { queryClient } from '~/lib/router';
import { dialog } from '~/modules/common/dialoger/state';
import { isSheet as checkSheet, sheet } from '~/modules/common/sheeter/state';
import { Button } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';
import type { Project } from '~/types';
import InputFormField from '~/modules/common/form-fields/input';
import SelectParentFormField from '~/modules/common/form-fields/select-parent';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import { updateProjectBodySchema } from 'backend/modules/projects/schema';
import { type UpdateProjectParams, updateProject } from '~/api/projects';

interface Props {
  project: Project;
  callback?: (project: Project) => void;
  dialog?: boolean;
  sheet?: boolean;
}

const formSchema = updateProjectBodySchema;

type FormValues = z.infer<typeof formSchema>;

export const useUpdateProjectMutation = (idOrSlug: string) => {
  return useMutation<Project, DefaultError, UpdateProjectParams>({
    mutationKey: ['projects', 'update', idOrSlug],
    mutationFn: (params) => updateProject(idOrSlug, params),
    onSuccess: (updatedProject) => {
      queryClient.setQueryData(['projects', idOrSlug], updatedProject);
      queryClient.invalidateQueries({
        queryKey: ['projects'],
      });
    },
    gcTime: 1000 * 10,
  });
};

const UpdateProjectForm = ({ project, callback, dialog: isDialog, sheet: isSheet }: Props) => {
  const { t } = useTranslation();

  const { mutate, isPending } = useUpdateProjectMutation(project.id);

  const formOptions: UseFormProps<FormValues> = {
    resolver: zodResolver(formSchema),
    defaultValues: {
      slug: project.slug,
      name: project.name,
      color: project.color,
      ...(project.workspaceId && { workspaceId: project.workspaceId }),
    },
  };

  const form = useFormWithDraft<FormValues>(`update-project-${project.id}`, formOptions);

  // Prevent data loss
  useBeforeUnload(form.formState.isDirty);

  const onSubmit = (values: FormValues) => {
    mutate(values, {
      onSuccess: (updatedProject) => {
        callback?.(updatedProject as Project);
        if (isDialog) dialog.remove();
        if (isSheet) sheet.remove();
        toast.success(t('common:success.update_resource', { resource: t('common:project') }));
      },
    });
  };

  // Update sheet title with unsaved changes
  useEffect(() => {
    if (!isSheet) return;
    if (form.unsavedChanges) {
      const targetSheet = sheet.get('edit-project');
      if (targetSheet && checkSheet(targetSheet)) {
        sheet.update('edit-project', {
          title: <UnsavedBadge title={targetSheet?.title} />,
        });
        return;
      }
    }
    sheet.reset('edit-project');
  }, [form.unsavedChanges]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <InputFormField control={form.control} name="name" label={t('common:name')} required />
        <SlugFormField
          control={form.control}
          type="PROJECT"
          label={t('common:project_handle')}
          description={t('common:project_handle.text')}
          previousSlug={project.slug}
        />
        <InputFormField control={form.control} name="color" label={t('common:color')} required />
        <SelectParentFormField
          collection="workspaces"
          type="WORKSPACE"
          control={form.control}
          label={t('common:workspace')}
          name="workspaceId"
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

export default UpdateProjectForm;
