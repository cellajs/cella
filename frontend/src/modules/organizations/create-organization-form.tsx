import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { type UseFormProps, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

// Change this in the future on current schema
import { createOrganizationBodySchema } from '#/modules/organizations/schema';

import { useNavigate } from '@tanstack/react-router';
import { isValidElement, useMemo } from 'react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { isDialog as checkDialog, dialog } from '~/modules/common/dialoger/state';
import InputFormField from '~/modules/common/form-fields/input';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import { addMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
import { organizationsKeys, useOrganizationCreateMutation } from '~/modules/organizations/query';
import type { Organization } from '~/modules/organizations/types';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, type LabelDirectionType } from '~/modules/ui/form';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';

interface CreateOrganizationFormProps {
  callback?: (org: Organization) => void;
  dialog?: boolean;
  replaceToCreatedOrg?: boolean;
  labelDirection?: LabelDirectionType;
  children?: React.ReactNode;
}

const formSchema = createOrganizationBodySchema;

type FormValues = z.infer<typeof formSchema>;

const CreateOrganizationForm: React.FC<CreateOrganizationFormProps> = ({
  dialog: isDialog,
  labelDirection = 'top',
  children,
  callback,
  replaceToCreatedOrg,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { nextStep } = useStepper();

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        name: '',
        slug: '',
      },
    }),
    [],
  );

  const dialogTitleUpdate = () => {
    const targetDialog = dialog.get('create-organization');
    if (!targetDialog || !checkDialog(targetDialog)) return;

    // Check if the title's type is a function (React component) and not a string
    if (isValidElement(targetDialog.title) && targetDialog.title.type === UnsavedBadge) return;

    dialog.update('create-organization', { title: <UnsavedBadge title={targetDialog?.title} /> });
  };

  const form = useFormWithDraft<FormValues>('create-organization', { formOptions, onUnsavedChanges: dialogTitleUpdate });

  // Watch to update slug field
  const name = useWatch({ control: form.control, name: 'name' });
  const mutateQuery = useMutateQueryData(organizationsKeys.list());

  const { mutate, isPending } = useOrganizationCreateMutation();

  const onSubmit = (values: FormValues) => {
    mutate(values, {
      onSuccess: (createdOrganization) => {
        form.reset();
        toast.success(t('common:success.create_resource', { resource: t('common:organization') }));
        nextStep?.();

        addMenuItem(createdOrganization, 'organizations');

        if (isDialog) dialog.remove(true, 'create-organization');

        mutateQuery.create([createdOrganization]);

        callback?.(createdOrganization);

        if (replaceToCreatedOrg) {
          navigate({
            to: '/$idOrSlug/members',
            params: {
              idOrSlug: createdOrganization.slug,
            },
          });
        }
      },
    });
  };

  return (
    <Form {...form} labelDirection={labelDirection}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <InputFormField control={form.control} name="name" label={t('common:name')} required />
        <SlugFormField
          control={form.control}
          type="organization"
          label={t('common:resource_handle', { resource: t('common:organization') })}
          description={t('common:resource_handle.text', { resource: t('common:organization').toLowerCase() })}
          nameValue={name}
        />

        <div className="flex flex-col sm:flex-row gap-2">
          {children}
          <SubmitButton disabled={!form.formState.isDirty} loading={isPending}>
            {t('common:create')}
          </SubmitButton>

          {!children && (
            <Button
              type="reset"
              variant="secondary"
              className={form.formState.isDirty ? '' : 'invisible'}
              aria-label="Cancel"
              onClick={() => form.reset()}
            >
              {t('common:cancel')}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
};

export default CreateOrganizationForm;
