import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { type UseFormProps, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

// Change this in the future on current schema
import { createOrganizationJsonSchema } from 'backend/modules/organizations/schema';
import { createOrganization } from '~/api/organizations';

import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import type { Organization } from '~/types';
import { dialog, isDialog as checkDialog } from '../common/dialoger/state';
import InputFormField from '../common/form-fields/input';
import { useStepper } from '../common/stepper/use-stepper';
import { SlugFormField } from '../common/form-fields/slug';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import { type LabelDirectionType, Form } from '../ui/form';

interface CreateOrganizationFormProps {
  callback?: (organization: Organization) => void;
  dialog?: boolean;
  labelDirection?: LabelDirectionType;
  children?: React.ReactNode;
}

const formSchema = createOrganizationJsonSchema;

type FormValues = z.infer<typeof formSchema>;

const CreateOrganizationForm: React.FC<CreateOrganizationFormProps> = ({ callback, dialog: isDialog, labelDirection = 'top', children }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setSheet } = useNavigationStore();
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

  const form = useFormWithDraft<FormValues>('create-organization', formOptions);

  // Watch to update slug field
  const name = useWatch({ control: form.control, name: 'name' });

  const { mutate: create, isPending } = useMutation({
    mutationFn: createOrganization,
    onSuccess: (result) => {
      form.reset();
      callback?.(result);
      toast.success(t('common:success.create_organization'));

      // If in stepper
      nextStep?.();

      if (!callback && !children) {
        navigate({
          to: '/$idOrSlug/members',
          params: {
            idOrSlug: result.slug,
          },
        });
        setSheet(null);
      }

      if (isDialog) {
        dialog.remove(true, 'create-organization');
      }
    },
  });

  // Update dialog title with unsaved changes
  useEffect(() => {
    if (form.unsavedChanges) {
      const targetDialog = dialog.get('create-organization');
      if (targetDialog && checkDialog(targetDialog)) {
        dialog.update('create-organization', {
          title: <UnsavedBadge title={targetDialog?.title} />,
        });
      }
      return;
    }
    dialog.reset('create-organization');
  }, [form.unsavedChanges]);

  const onSubmit = (values: FormValues) => {
    create(values);
  };

  return (
    <Form {...form} labelDirection={labelDirection}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <InputFormField control={form.control} name="name" label={t('common:name')} required />
        <SlugFormField
          control={form.control}
          type="ORGANIZATION"
          label={t('common:organization_handle')}
          description={t('common:organization_handle.text')}
          nameValue={name}
        />

        <div className="flex flex-col sm:flex-row gap-2">
          {children}
          <Button type="submit" disabled={!form.formState.isDirty} loading={isPending}>
            {t('common:create')}
          </Button>

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
