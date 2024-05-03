import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { type UseFormProps, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

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
import type { Organization, Workspace } from '~/types';
import { dialog, isDialog as checkDialog } from '../common/dialoger/state';
import InputFormField from '../common/form-fields/input';
import { SlugFormField } from '../common/form-fields/slug';
import { useNavigate } from '@tanstack/react-router';
import { Form } from '../ui/form';
import SelectParentFormField from '../common/form-fields/select-parent';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import CreateOrganizationForm from '../organizations/create-organization-form';
import UnsavedChangesBadge from '~/modules/common/unsaved-changes';

interface CreateWorkspaceFormProps {
  callback?: (workspace: Workspace) => void;
  dialog?: boolean;
}

const formSchema = createWorkspaceJsonSchema.extend({
  organization: z.string().min(1),
});

type FormValues = z.infer<typeof formSchema>;

const CreateWorkspaceForm: React.FC<CreateWorkspaceFormProps> = ({ callback, dialog: isDialog }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setSheet, menu } = useNavigationStore();

  const organizations = menu.organizations.items;
  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        name: '',
        slug: '',
        organization: organizations.length === 1 ? organizations[0].id : '',
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

  const organizationCreated = (organization: Organization) => {
    form.setValue('organization', organization.id);
  };

  // Update dialog title with unsaved changes
  useEffect(() => {
    if (form.unsavedChanges) {
      const targetDialog = dialog.get('create-workspace');
      if (targetDialog && checkDialog(targetDialog)) {
        dialog.update('create-workspace', {
          title: <UnsavedChangesBadge title={targetDialog?.title} />,
        });
      }
      return;
    }
    dialog.reset('create-workspace');
  }, [form.unsavedChanges]);

  if (!form.getValues('organization') && !menu.organizations.items.length)
    return (
      <Alert variant="plain" className="border-0 w-auto">
        <AlertTitle>{t('common:no_organization')}</AlertTitle>
        <AlertDescription className="pr-8 font-light">
          <p className="mb-2">{t('common:organization_required.text')}</p>
          <Button
            onClick={() => {
              dialog(<CreateOrganizationForm callback={organizationCreated} dialog />, {
                className: 'md:max-w-xl',
                id: 'create-organization',
                title: t('common:create_organization'),
              });
            }}
          >
            <span>{t('common:create_organization')}</span>
          </Button>
        </AlertDescription>
      </Alert>
    );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <InputFormField control={form.control} name="name" label={t('common:name')} required />
        <SlugFormField
          control={form.control}
          type="WORKSPACE"
          label={t('common:workspace_handle')}
          description={t('common:workspace_handle.text')}
          nameValue={name}
        />

        <SelectParentFormField collection="organizations" control={form.control} label={t('common:organization')} name="organization" required />

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
