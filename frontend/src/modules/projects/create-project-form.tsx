import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { type UseFormProps, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { createProjectBodySchema } from 'backend/modules/projects/schema';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { createProject } from '~/api/projects';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutateWorkSpaceQueryData } from '~/hooks/use-mutate-query-data';
import { useMutation } from '~/hooks/use-mutations';
import { isDialog as checkDialog, dialog } from '~/modules/common/dialoger/state';
import InputFormField from '~/modules/common/form-fields/input';
import SelectParentFormField from '~/modules/common/form-fields/select-parent';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import { addMenuItem } from '~/modules/common/nav-sheet/helpers/add-menu-item';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import { Button } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';
import { useWorkspaceStore } from '~/store/workspace';
import type { Workspace } from '~/types/app';
import type { UserMenuItem } from '~/types/common';

interface CreateProjectFormProps {
  workspace: Workspace;
  callback?: () => void;
  dialog?: boolean;
}

const formSchema = createProjectBodySchema;

type FormValues = z.infer<typeof formSchema>;

export const CreateProjectForm: React.FC<CreateProjectFormProps> = ({ workspace, dialog: isDialog }) => {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const { setWorkspace, projects } = useWorkspaceStore();
  const type = 'project';
  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        name: '',
        slug: '',
        workspaceId: workspace.id,
      },
    }),
    [],
  );

  // Form with draft in local storage
  const form = useFormWithDraft<FormValues>('create-project', formOptions);
  // Watch to update slug field
  const name = useWatch({ control: form.control, name: 'name' });

  const callback = useMutateWorkSpaceQueryData(['workspaces', workspace.slug]);
  const { mutate: create, isPending } = useMutation({
    mutationFn: (values: FormValues) => {
      return createProject({ ...values, workspaceId: workspace.id, organizationId: workspace.organizationId });
    },
    onSuccess: (createdProject) => {
      form.reset();
      toast.success(t('common:success.create_resource', { resource: t(`common:${type}`) }));
      if (isDialog) dialog.remove();
      setWorkspace(workspace, [...projects, createdProject]);
      useNavigationStore.setState({
        menu: addMenuItem({ ...createdProject, ...({ parentId: createdProject.workspaceId } as UserMenuItem) }, 'workspaces'),
      });
      callback([{ ...createdProject, ...{ members: [user] } }], 'createProject');
    },
  });

  const onSubmit = (values: FormValues) => {
    create(values);
  };

  // Update dialog title with unsaved changes
  useEffect(() => {
    if (form.unsavedChanges) {
      const targetDialog = dialog.get('create-project');
      if (targetDialog && checkDialog(targetDialog)) {
        dialog.update('create-project', {
          title: <UnsavedBadge title={targetDialog?.title} />,
        });
      }
      return;
    }
    dialog.reset('create-project');
  }, [form.unsavedChanges]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <InputFormField control={form.control} name="name" label={t('common:name')} required autoFocus />
        <SlugFormField
          control={form.control}
          type="project"
          label={t('common:resource_handle', { resource: t('app:project') })}
          description={t('common:resource_handle.text', { resource: t('app:project').toLowerCase() })}
          nameValue={name}
        />
        <SelectParentFormField collection="workspaces" type={type} control={form.control} label={t('app:workspace')} name="workspaceId" disabled />
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="submit" disabled={!form.formState.isDirty} loading={isPending}>
            {t('common:create')}
          </Button>
          <Button
            type="reset"
            variant="secondary"
            className={form.formState.isDirty ? '' : 'invisible'}
            aria-label="Cancel"
            onClick={() => form.reset()}
          >
            {t('common:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
};
