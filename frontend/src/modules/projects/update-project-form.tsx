import { zodResolver } from '@hookform/resolvers/zod';
import { type DefaultError, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { updateProjectBodySchema } from 'backend/modules/projects/schema';
import { useEffect } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { toast } from 'sonner';
import { type UpdateProjectParams, updateProject } from '~/api/projects';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { queryClient } from '~/lib/router';
import { cleanUrl } from '~/lib/utils';
import { dialog } from '~/modules/common/dialoger/state';
import AvatarFormField from '~/modules/common/form-fields/avatar';
import InputFormField from '~/modules/common/form-fields/input';
import SelectParentFormField from '~/modules/common/form-fields/select-parent';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import { sheet } from '~/modules/common/sheeter/state';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import { Button } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';
import { useWorkspaceStore } from '~/store/workspace';
import type { Project } from '~/types/app';

interface Props {
  project: Project;
  callback?: (project: Project) => void;
  dialog?: boolean;
  sheet?: boolean;
}

const formSchema = updateProjectBodySchema;

type FormValues = z.infer<typeof formSchema>;

export const useUpdateProjectMutation = (idOrSlug: string, orgIdOrSlug: string) => {
  return useMutation<Project, DefaultError, UpdateProjectParams>({
    mutationKey: ['projects', 'update', idOrSlug],
    mutationFn: (params) => updateProject(idOrSlug, orgIdOrSlug, params),
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
  const { setWorkspace, workspace, projects } = useWorkspaceStore();
  const { mutate, isPending } = useUpdateProjectMutation(project.id, project.organizationId);

  const formOptions: UseFormProps<FormValues> = {
    resolver: zodResolver(formSchema),
    defaultValues: {
      slug: project.slug,
      name: project.name,
      thumbnailUrl: cleanUrl(project.thumbnailUrl),
      parentId: project.parentId,
    },
  };

  const form = useFormWithDraft<FormValues>(`update-project-${project.id}`, formOptions);

  // Prevent data loss
  useBeforeUnload(form.formState.isDirty);

  const setImageUrl = (url: string) => {
    form.setValue('thumbnailUrl', url, { shouldDirty: true });
  };

  const onSubmit = (values: FormValues) => {
    mutate(values, {
      onSuccess: (updatedProject) => {
        if (isDialog) dialog.remove();
        if (isSheet) sheet.remove();
        form.reset(updatedProject);
        toast.success(t('common:success.update_resource', { resource: t('app:project') }));
        setWorkspace(
          workspace,
          [...projects.filter((p) => p.id !== updatedProject.id), updatedProject].sort((a, b) => {
            const orderA = a.membership ? a.membership.order : 0; // Default value if membership is null
            const orderB = b.membership ? b.membership.order : 0;
            return orderA - orderB;
          }),
        );
        callback?.(updatedProject as Project);
      },
    });
  };

  // Update sheet title with unsaved changes
  useEffect(() => {
    if (!isSheet) return;
    if (form.unsavedChanges) {
      const targetSheet = sheet.get('edit-project');
      if (targetSheet && targetSheet.title?.type?.name !== 'UnsavedBadge') {
        sheet.update('edit-project', {
          title: <UnsavedBadge title={targetSheet?.title} />,
        });
        return;
      }
    }
  }, [form.unsavedChanges]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <AvatarFormField
          control={form.control}
          label={t('common:resource_logo', { resource: t('app:project') })}
          type="project"
          name="thumbnailUrl"
          entity={project}
          url={form.getValues('thumbnailUrl')}
          setUrl={setImageUrl}
        />
        <InputFormField control={form.control} name="name" label={t('common:name')} required />
        <SlugFormField
          control={form.control}
          type="project"
          label={t('common:resource_handle', { resource: t('app:project') })}
          description={t('common:resource_handle.text', { resource: t('app:project').toLowerCase() })}
          previousSlug={project.slug}
        />
        <SelectParentFormField collection="workspaces" type="workspace" control={form.control} label={t('app:workspace')} name="parentId" disabled />
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
