import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { useMemo } from 'react';
import { type UseFormProps, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import type { Organization } from '~/api.gen';
import { zCreateOrganizationsData } from '~/api.gen/zod.gen';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { CallbackArgs } from '~/modules/common/data-table/types';
import { InputFormField } from '~/modules/common/form-fields/input';
import { SelectTenantFormField } from '~/modules/common/form-fields/select-combobox/tenant';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import { useStepper } from '~/modules/common/stepper';
import { toaster } from '~/modules/common/toaster/service';
import { useOrganizationCreateMutation } from '~/modules/organization/query';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, type LabelDirectionType } from '~/modules/ui/form';
import { nanoid } from '~/utils/nanoid';

interface Props {
  dialog?: boolean;
  labelDirection?: LabelDirectionType;
  children?: React.ReactNode;
  callback?: (args: CallbackArgs<Organization>) => void;
}

// Combine body item schema with tenantId from path
const formSchema = zCreateOrganizationsData.shape.body.element.omit({ id: true }).extend({
  tenantId: z.string().min(1, 'error:form.required'),
});
type FormValues = z.infer<typeof formSchema>;

export function CreateOrganizationForm({ labelDirection = 'top', children, callback }: Props) {
  const { t } = useTranslation();

  const { nextStep } = useStepper();

  const defaultValues = { name: '', slug: '', tenantId: '' };
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
    const { tenantId, ...rest } = values;
    mutate(
      { tenantId, body: [{ ...rest, id: `temp-${nanoid()}` }] },
      {
        onSuccess: (createdOrganization) => {
          form.reset();
          toaster(t('common:success.create_resource', { resource: t('common:organization') }), 'success');

          callback?.({ data: createdOrganization, status: 'success' }); // Trigger callback

          // Since this form is also used in onboarding, we need to call the next step
          // This should ideally be done through the callback, but we need to refactor stepper
          nextStep?.();
        },
        onError: (error) => {
          if (error.message === 'org_limit_reached') {
            toaster(t('error:org_limit_reached'), 'warning');
          }
        },
      },
    );
  };

  return (
    <Form {...form} labelDirection={labelDirection}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <SelectTenantFormField control={form.control} name="tenantId" label={t('common:tenant')} required />
        <InputFormField control={form.control} name="name" label={t('common:name')} required />
        <SlugFormField
          control={form.control}
          entityType="organization"
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
            <Button
              type="reset"
              variant="secondary"
              className={form.isDirty ? '' : 'invisible'}
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
}
