import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { type UseFormProps, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

// Change this in the future on current schema
import { createWorkspaceJsonSchema } from 'backend/modules/workspaces/schema';

// import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import { dialog } from '../common/dialoger/state';
import InputFormField from '../common/form-fields/input';
import { SlugFormField } from '../common/form-fields/slug';
// import { useNavigate } from '@tanstack/react-router';
import { SquarePen } from 'lucide-react';
import { Form } from '../ui/form';
import { Badge } from '../ui/badge';
import type { Workspace } from '~/types';
import SelectFormField from '~/modules/common/form-fields/space-select';

interface CreateProjectFormProps {
  workspace: Workspace;
  callback?: () => void;
  dialog?: boolean;
}

const formSchema = createWorkspaceJsonSchema.extend({
  organization: z.string().min(1),
  workspace: z.string().min(1),
});

type FormValues = z.infer<typeof formSchema>;

export const CreateProjectForm: React.FC<CreateProjectFormProps> = ({ workspace, dialog: isDialog }) => {
  const { t } = useTranslation();
  // const navigate = useNavigate();
  const { setSheet } = useNavigationStore();

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        name: '',
        slug: '',
        organization: workspace.organizationId,
        workspace: workspace.id,
      },
    }),
    [],
  );

  // Form with draft in local storage
  const form = useFormWithDraft<FormValues>('create-project', formOptions);
  // Watch to update slug field
  const name = useWatch({ control: form.control, name: 'name' });

  const { mutate: _, isPending } = useMutation({
    // mutationFn: createWorkspace,
    onSuccess: () => {
      form.reset();
      toast.success(t('common:success.create_project'));

      setSheet(null);
      // navigate({
      //   to: '/workspace/$idOrSlug/projects',
      //   params: { idOrSlug: result.slug },
      // });

      if (isDialog) dialog.remove();
    },
  });

  const onSubmit = (values: FormValues) => {
    console.log('values:', values);
    // create(values);
  };

  useEffect(() => {
    if (form.unsavedChanges) {
      dialog.updateTitle(
        '1',
        <Badge variant="plain" className="w-fit">
          <SquarePen size={12} className="mr-2" />
          <span className="font-light">{t('common:unsaved_changes')}</span>
        </Badge>,
        true,
      );
      return;
    }
    dialog.setDefaultTitle('1');
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
        <SelectFormField selectFor="organizations" control={form.control} label={t('common:organization')} name="organization" disabled />
        <SelectFormField selectFor="workspaces" control={form.control} label={t('common:workspace')} name="workspace" disabled />
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
