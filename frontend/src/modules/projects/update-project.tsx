import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import type { UseFormProps } from 'react-hook-form';
import { toast } from 'sonner';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { useFormWithDraft } from '~/hooks/use-draft-form';
// import { queryClient } from '~/lib/router';
import { dialog } from '~/modules/common/dialoger/state';
import { sheet, isSheet as checkSheet } from '~/modules/common/sheeter/state';
import { Button } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';
import InputFormField from '../common/form-fields/input';
import { SlugFormField } from '../common/form-fields/slug';
import SelectParentFormField from '../common/form-fields/select-parent';
import { useEffect } from 'react';
import UnsavedChangesBadge from '../common/unsaved-changes-badge';

interface Project {
  id: string;
  slug: string;
  name: string;
  organizationId: string;
  workspaceId: string;
}

interface Props {
  project: Project;
  callback?: (project: Project) => void;
  dialog?: boolean;
  sheet?: boolean;
}

const formSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  organizationId: z.string(),
  workspaceId: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

export const useUpdateProjectMutation = (idOrSlug: string) => {
  return useMutation({
    onSuccess: () => {
      console.log(idOrSlug);
    },
  });
  //   return useMutation<Project, DefaultError, UpdateProjectParams>({
  //     mutationKey: ['project', 'update', idOrSlug],
  //     mutationFn: (params) => UpdateProjectForm(idOrSlug, params),
  //     onSuccess: (project) => {
  //       queryClient.setQueryData(['project', idOrSlug], project);
  //     },
  //     gcTime: 1000 * 10,
  //   });
};

const UpdateProjectForm = ({ project, callback, dialog: isDialog, sheet: isSheet }: Props) => {
  const { t } = useTranslation();

  const { mutate, isPending } = useUpdateProjectMutation(project.id);

  const formOptions: UseFormProps<FormValues> = {
    resolver: zodResolver(formSchema),
    defaultValues: {
      slug: project.slug,
      name: project.name,
      organizationId: project.organizationId,
      workspaceId: project.workspaceId,
    },
  };

  const form = useFormWithDraft<FormValues>(`update-project-${project.id}`, formOptions);

  // Prevent data loss
  useBeforeUnload(form.formState.isDirty);

  const onSubmit = (values: FormValues) => {
    if (isDialog) dialog.remove();
    callback?.({} as Project);
    mutate();
    console.log(values);

    toast.success(t('common:success.update_project'));
    // mutate(values, {
    //   onSuccess: (data) => {
    //     callback?.(data as Project);
    //     if (isDialog) dialog.remove();
    //     toast.success(t('common:success.update_project'));
    //   },
    // });
  };

  // Update sheet title with unsaved changes
  useEffect(() => {
    if (!isSheet) return;
    if (form.unsavedChanges) {
      const targetSheet = sheet.get('edit-project');
      if (targetSheet && checkSheet(targetSheet)) {
        sheet.update('edit-project', {
          title: <UnsavedChangesBadge title={targetSheet?.title} />,
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
        <SelectParentFormField collection="organizations" control={form.control} label={t('common:organization')} name="organizationId" required />
        <SelectParentFormField collection="workspaces" control={form.control} label={t('common:workspace')} name="workspaceId" required />
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
