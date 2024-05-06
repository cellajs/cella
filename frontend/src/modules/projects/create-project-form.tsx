import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { useWatch, type UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

// Change this in the future on current schema
import { createWorkspaceJsonSchema } from 'backend/modules/workspaces/schema';

// import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import SelectParentFormField from '~/modules/common/form-fields/select-parent';
import UnsavedChangesBadge from '~/modules/common/unsaved-changes-badge';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';
import type { Workspace } from '~/types';
import { useElectric } from '../common/app/electric';
import { isDialog as checkDialog, dialog } from '../common/dialoger/state';
import InputFormField from '../common/form-fields/input';
import { SlugFormField } from '../common/form-fields/slug';
// import { useNavigate } from '@tanstack/react-router';
import { Form } from '../ui/form';

interface CreateProjectFormProps {
  workspace: Workspace;
  callback?: () => void;
  dialog?: boolean;
}

const formSchema = createWorkspaceJsonSchema.extend({
  workspace: z.string().min(1),
});

type FormValues = z.infer<typeof formSchema>;

export const CreateProjectForm: React.FC<CreateProjectFormProps> = ({ workspace, dialog: isDialog }) => {
  const { t } = useTranslation();
  const { user } = useUserStore(({ user }) => ({ user }));
  // const navigate = useNavigate();
  const { setSheet } = useNavigationStore();

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const { db } = useElectric()!;

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        name: '',
        slug: '',
        workspace: workspace.id,
      },
    }),
    [],
  );

  // Form with draft in local storage
  const form = useFormWithDraft<FormValues>('create-project', formOptions);
  // Watch to update slug field
  const name = useWatch({ control: form.control, name: 'name' });

  const { mutate: create, isPending } = useMutation({
    mutationFn: (values: FormValues) => {
      return db.projects.create({
        data: {
          id: window.crypto.randomUUID(),
          name: values.name,
          slug: values.slug,
          workspace_id: values.workspace,
          // TODO: Add color picker
          color: '#000000',
          created_at: new Date(),
          created_by: user.id,
        },
      });
    },
    onSuccess: () => {
      form.reset();
      toast.success(t('common:success.create_project'));

      setSheet(null);
      // navigate({
      //   to: '/workspace/$idOrSlug/board',
      //   params: { idOrSlug: result.slug },
      // });

      if (isDialog) dialog.remove();
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
          title: <UnsavedChangesBadge title={targetDialog?.title} />,
        });
      }
      return;
    }
    dialog.reset('create-project');
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
          nameValue={name}
        />
        <SelectParentFormField collection="workspaces" control={form.control} label={t('common:workspace')} name="workspace" disabled />
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
