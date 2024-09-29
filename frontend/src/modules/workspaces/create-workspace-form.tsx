import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { type UseFormProps, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { createWorkspaceBodySchema } from 'backend/modules/workspaces/schema';
import { createWorkspace } from '~/api/workspaces';

import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { addMenuItem } from '~/lib/utils';
import { isDialog as checkDialog, dialog } from '~/modules/common/dialoger/state';
import InputFormField from '~/modules/common/form-fields/input';
import SelectParentFormField from '~/modules/common/form-fields/select-parent';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';
import { useNavigationStore } from '~/store/navigation';
import type { Workspace } from '~/types/app';
import type { Organization, UserMenuItem } from '~/types/common';

interface CreateWorkspaceFormProps {
  callback?: (workspace: Workspace) => void;
  dialog?: boolean;
}

const formSchema = createWorkspaceBodySchema;

type FormValues = z.infer<typeof formSchema>;

const CreateWorkspaceForm: React.FC<CreateWorkspaceFormProps> = ({ callback, dialog: isDialog }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { menu } = useNavigationStore();

  const organizations = menu.organizations;
  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        name: '',
        slug: '',
        organizationId: organizations.length >= 1 ? organizations[0].id : '',
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
    onSuccess: (createdWorkspace) => {
      form.reset();
      toast.success(t('common:success.create_resource', { resource: t('app:workspace') }));
      if (isDialog) dialog.remove();

      useNavigationStore.setState({
        menu: addMenuItem(createdWorkspace as UserMenuItem, 'workspaces'),
      });
      navigate({
        to: '/$orgIdOrSlug/workspaces/$idOrSlug/board',
        params: { idOrSlug: createdWorkspace.slug, orgIdOrSlug: createdWorkspace.organizationId },
      });
      callback?.(createdWorkspace);
    },
  });

  const onSubmit = (values: FormValues) => {
    create(values);
  };

  const organizationCreated = (organization: Organization) => {
    form.setValue('organizationId', organization.id);
  };

  // Update dialog title with unsaved changes
  useEffect(() => {
    if (form.unsavedChanges) {
      const targetDialog = dialog.get('create-workspace');
      if (targetDialog && checkDialog(targetDialog)) {
        dialog.update('create-workspace', {
          title: <UnsavedBadge title={targetDialog?.title} />,
        });
      }
      return;
    }
    dialog.reset('create-workspace');
  }, [form.unsavedChanges]);

  if (!form.getValues('organizationId') && !menu.organizations.length)
    return (
      <Alert variant="plain" className="border-0 w-auto">
        <AlertTitle>{t('common:resource_required', { resource: t('common:organization') })}</AlertTitle>
        <AlertDescription className="pr-8 font-light">
          <p className="mb-2">{t('app:organization_required.text')}</p>
          <Button
            onClick={() => {
              dialog(<CreateOrganizationForm callback={organizationCreated} dialog />, {
                className: 'md:max-w-2xl',
                id: 'create-organization',
                title: t('common:create_resource', { resource: t('common:organization').toLowerCase() }),
              });
            }}
          >
            <span>{t('common:create_resource', { resource: t('common:organization').toLowerCase() })}</span>
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
          type="workspace"
          label={t('common:resource_handle', { resource: t('app:workspace') })}
          description={t('common:resource_handle.text', { resource: t('app:workspace').toLowerCase() })}
          nameValue={name}
        />

        <SelectParentFormField
          collection="organizations"
          type="organization"
          control={form.control}
          label={t('common:organization')}
          name="organizationId"
          required
        />

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
