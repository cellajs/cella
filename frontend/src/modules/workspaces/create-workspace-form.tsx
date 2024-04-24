import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { type UseFormProps, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

// Change this in the future on current schema
import { createWorkspaceJsonSchema } from 'backend/modules/workspaces/schema';
import { createWorkspace } from '~/api/workspaces';

// import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import type { Workspace } from '~/types';
import { dialog } from '../common/dialoger/state';
import InputFormField from '../common/form-fields/input';
import { SlugFormField } from '../common/form-fields/slug';
import SelectOrganizationFormField from '../common/form-fields/select-organization';
import { useNavigate } from '@tanstack/react-router';
import { SquarePen } from 'lucide-react';
import { Form } from '../ui/form';
import { Badge } from '../ui/badge';

interface CreateWorkspaceFormProps {
  callback?: (workspace: Workspace) => void;
  dialog?: boolean;
}

const formSchema = createWorkspaceJsonSchema;

type FormValues = z.infer<typeof formSchema>;

const CreateWorkspaceForm: React.FC<CreateWorkspaceFormProps> = ({ callback, dialog: isDialog }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setSheet } = useNavigationStore();

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        name: '',
        slug: '',
        organizationId: '',
      },
    }),
    [],
  );

  // Form with draft in local storage
  const form = useFormWithDraft<FormValues>('create-workspace', formOptions);
  // Watch to update slug field
  const name = useWatch({ control: form.control, name: 'name' });

  const { mutate: create, isPending } = useMutation({
    mutationFn: createWorkspace,
    onSuccess: (result) => {
      form.reset();
      callback?.(result);
      toast.success(t('common:success.create_workspace'));

      setSheet(null);
      navigate({
        to: '/workspace/$idOrSlug/projects',
        params: { idOrSlug: result.slug },
      });

      if (isDialog) dialog.remove();
    },
  });

  const onSubmit = (values: FormValues) => {
    create(values);
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
        <SlugFormField control={form.control} label={t('common:workspace_handle')} description={t('common:workspace_handle.text')} nameValue={name} />
        <SelectOrganizationFormField control={form.control} label={t('common:organization')} name="organizationId" required />

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

export default CreateWorkspaceForm;
