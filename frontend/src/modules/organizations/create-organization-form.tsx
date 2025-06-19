import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { useMemo } from 'react';
import { type UseFormProps, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod/v4';
// Change this in the future on current schema
import { useFormWithDraft } from '~/hooks/use-draft-form';
import InputFormField from '~/modules/common/form-fields/input';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import { useStepper } from '~/modules/common/stepper';
import { useOrganizationCreateMutation } from '~/modules/organizations/query';
import type { Organization } from '~/modules/organizations/types';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, type LabelDirectionType } from '~/modules/ui/form';
import { zCreateOrganizationData } from '~/openapi-client/zod.gen';

interface Props {
  callback?: (org: Organization) => void;
  dialog?: boolean;
  labelDirection?: LabelDirectionType;
  children?: React.ReactNode;
}

const formSchema = zCreateOrganizationData;
type FormValues = z.infer<typeof formSchema>;

const CreateOrganizationForm = ({ labelDirection = 'top', children, callback }: Props) => {
  const { t } = useTranslation();

  const { nextStep } = useStepper();

  const defaultValues = { name: '', slug: '' };
  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues,
    }),
    [],
  );

  const formContainerId = 'create-organization';
  const form = useFormWithDraft<FormValues>(formContainerId, { formOptions });

  // Watch to update slug field
  const name = useWatch({ control: form.control, name: 'name' });

  const { mutate, isPending } = useOrganizationCreateMutation();

  const onSubmit = (values: FormValues) => {
    mutate(values, {
      onSuccess: (createdOrganization) => {
        form.reset();
        toast.success(t('common:success.create_resource', { resource: t('common:organization') }));

        callback?.(createdOrganization); // Trigger callback

        // Since this form is also used in onboarding, we need to call the next step
        // This should ideally be done through the callback, but we need to refactor stepper
        nextStep?.();
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
          <SubmitButton disabled={!form.isDirty} loading={isPending}>
            {t('common:create')}
          </SubmitButton>
          {children}

          {!children && (
            <Button type="reset" variant="secondary" className={form.isDirty ? '' : 'invisible'} aria-label="Cancel" onClick={() => form.reset()}>
              {t('common:cancel')}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
};

export default CreateOrganizationForm;
