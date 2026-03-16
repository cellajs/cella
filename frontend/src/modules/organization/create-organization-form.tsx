import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';
import { type UseFormProps, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { nanoid } from 'shared/nanoid';
import { z } from 'zod';
import type { Organization } from '~/api.gen';
import { zCreateOrganizationsData } from '~/api.gen/zod.gen';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { CallbackArgs } from '~/modules/common/data-table/types';
import { InputFormField } from '~/modules/common/form-fields/input';
import { SelectTenantFormField } from '~/modules/common/form-fields/select-combobox/tenant';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import { useStepper } from '~/modules/common/stepper/stepper';
import { toaster } from '~/modules/common/toaster/toaster';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { useOrganizationAutoCreateMutation, useOrganizationCreateMutation } from '~/modules/organization/query';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, type LabelDirectionType } from '~/modules/ui/field';

interface Props {
  dialog?: boolean;
  labelDirection?: LabelDirectionType;
  children?: React.ReactNode;
  callback?: (args: CallbackArgs<Organization>) => void;
}

// Schema for regular creation with existing tenant
const withTenantSchema = zCreateOrganizationsData.shape.body.element.omit({ id: true }).extend({
  tenantId: z.string().min(1, 'error:form.required'),
});

// Schema for auto-creation (no tenant required)
const autoCreateSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(2).max(100),
});

type WithTenantValues = z.infer<typeof withTenantSchema>;
type AutoCreateValues = z.infer<typeof autoCreateSchema>;
type FormValues = WithTenantValues | AutoCreateValues;

export function CreateOrganizationForm({ labelDirection = 'top', children, callback }: Props) {
  const { t } = useTranslation();
  const { nextStep } = useStepper();

  // Check if user has any memberships (determines if they have tenants)
  const membershipsQuery = useQuery(myMembershipsQueryOptions());
  const hasTenants = (membershipsQuery.data?.items?.length ?? 0) > 0;

  // State for handling existing_tenant_found response
  const [existingTenant, setExistingTenant] = useState<{ tenantName: string; domain: string } | null>(null);

  const formSchema = hasTenants ? withTenantSchema : autoCreateSchema;
  const defaultValues = hasTenants ? { name: '', slug: '', tenantId: '' } : { name: '', slug: '' };

  const formOptions: UseFormProps<FormValues> = {
    resolver: zodResolver(formSchema),
    defaultValues,
  };

  const formContainerId = 'create-organization';
  const form = useFormWithDraft<FormValues>(formContainerId, { formOptions });

  const name = useWatch({ control: form.control, name: 'name' });
  const tenantId = hasTenants ? useWatch({ control: form.control, name: 'tenantId' as never }) : '';

  const createMutation = useOrganizationCreateMutation();
  const autoCreateMutation = useOrganizationAutoCreateMutation();
  const isPending = createMutation.isPending || autoCreateMutation.isPending;

  const onSuccess = (createdOrganization: Organization) => {
    form.reset();
    setExistingTenant(null);
    toaster(t('common:success.create_resource', { resource: t('common:organization') }), 'success');
    callback?.({ data: createdOrganization, status: 'success' });
    nextStep?.();
  };

  const onSubmit = (values: FormValues) => {
    if (hasTenants && 'tenantId' in values) {
      // Regular flow: create org within existing tenant
      const { tenantId, ...rest } = values;
      createMutation.mutate(
        { path: { tenantId }, body: [{ ...rest, id: `temp-${nanoid()}` }] },
        {
          onSuccess: (createdOrganization) => onSuccess(createdOrganization),
          onError: (error) => {
            if (error.message === 'org_limit_reached') {
              toaster(t('error:org_limit_reached'), 'warning');
            }
          },
        },
      );
    } else {
      // Auto-create flow: create org + tenant together
      autoCreateMutation.mutate(
        { name: values.name, slug: values.slug, createNewTenant: !!existingTenant },
        {
          onSuccess: (createdOrganization) => onSuccess(createdOrganization),
          onError: (error) => {
            // Handle existing_tenant_found info response
            if (error.message === 'existing_tenant_found') {
              const meta = (error as any).meta;
              setExistingTenant({ tenantName: meta?.tenantName ?? '', domain: meta?.domain ?? '' });
              return;
            }
          },
        },
      );
    }
  };

  return (
    <Form {...form} labelDirection={labelDirection}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {hasTenants && (
          <SelectTenantFormField control={form.control} name="tenantId" label={t('common:tenant')} required autoHide />
        )}

        {existingTenant && (
          <Alert>
            <AlertDescription>
              {t('common:existing_tenant_found.text', {
                tenantName: existingTenant.tenantName,
                domain: existingTenant.domain,
              })}
            </AlertDescription>
          </Alert>
        )}

        <InputFormField
          control={form.control}
          name="name"
          label={t('common:name')}
          placeholder={t('common:placeholder.type_name')}
          required
        />
        <SlugFormField
          control={form.control}
          entityType="organization"
          label={t('common:resource_handle', { resource: t('common:organization') })}
          description={t('common:resource_handle.text', { resource: t('common:organization').toLowerCase() })}
          nameValue={name}
          prefix={`/${tenantId || '~'}/`}
        />

        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton disabled={!form.isDirty && !existingTenant} loading={isPending}>
            {existingTenant ? t('common:create_own_workspace') : t('common:create')}
          </SubmitButton>
          {children}

          {!children && (
            <Button
              type="reset"
              variant="secondary"
              className={form.isDirty ? '' : 'invisible'}
              aria-label="Cancel"
              onClick={() => {
                form.reset();
                setExistingTenant(null);
              }}
            >
              {t('common:cancel')}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
