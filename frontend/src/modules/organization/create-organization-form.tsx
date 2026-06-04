import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { type UseFormProps, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
// biome-ignore lint/style/noRestrictedImports: colocated mutation — self-creation flow with multi-step navigation side-effects.
import { selfCreateTenant } from 'sdk';
import { zCreateOrganizationsBody } from 'sdk/zod.gen';
import { generateId } from 'shared/entity-id';
import { z } from 'zod';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { InputFormField } from '~/modules/common/form-fields/input';
import { SelectTenantFormField } from '~/modules/common/form-fields/select-combobox/tenant';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import { useStepper } from '~/modules/common/stepper/stepper';
import { toaster } from '~/modules/common/toaster/toaster';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { useOrganizationCreateMutation } from '~/modules/organization/query';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, type LabelDirectionType } from '~/modules/ui/field';

interface Props {
  dialog?: boolean;
  labelDirection?: LabelDirectionType;
  children?: React.ReactNode;
  callback?: (args: CallbackArgs<Organization>) => void;
}

// Schema for regular creation with existing tenant
const withTenantSchema = zCreateOrganizationsBody.element.omit({ id: true }).extend({
  tenantId: z.string().min(1, 'error:form.required'),
});

// Schema for first-time creation (no tenant yet — will be created automatically)
const noTenantSchema = zCreateOrganizationsBody.element.omit({ id: true });

type WithTenantValues = z.infer<typeof withTenantSchema>;
type NoTenantValues = z.infer<typeof noTenantSchema>;
type FormValues = WithTenantValues | NoTenantValues;

export function CreateOrganizationForm({ labelDirection = 'top', children, callback }: Props) {
  const { t } = useTranslation();
  const { nextStep } = useStepper();

  // Check if user has any memberships (determines if they have tenants)
  const membershipsQuery = useQuery(myMembershipsQueryOptions());
  const memberships = membershipsQuery.data?.items ?? [];
  const hasTenants = memberships.length > 0;
  const uniqueTenantCount = new Set(memberships.map((m) => m.tenantId)).size;

  const formSchema = hasTenants ? withTenantSchema : noTenantSchema;
  const singleTenantId = uniqueTenantCount === 1 ? memberships[0].tenantId : '';
  const defaultValues = hasTenants ? { name: '', slug: '', tenantId: singleTenantId } : { name: '', slug: '' };

  const formOptions: UseFormProps<FormValues> = {
    resolver: zodResolver(formSchema),
    defaultValues,
  };

  const formContainerId = 'create-organization';
  const form = useFormWithDraft<FormValues>(formContainerId, { formOptions });

  const name = useWatch({ control: form.control, name: 'name' });
  const tenantId = (hasTenants ? useWatch({ control: form.control, name: 'tenantId' as never }) : '') as string;

  const createMutation = useOrganizationCreateMutation();

  const onSuccess = (createdOrganization: Organization) => {
    form.reset();
    toaster(t('c:success.create_resource', { resource: t('c:organization') }), 'success');
    callback?.({ data: createdOrganization, status: 'success' });
    nextStep?.();
  };

  const onSubmit = async (values: FormValues) => {
    let resolvedTenantId = 'tenantId' in values ? values.tenantId : '';

    // No tenant yet — create one first, then create the org
    if (!resolvedTenantId) {
      try {
        const tenant = await selfCreateTenant({ body: { name: `${values.name} workspace` } });
        resolvedTenantId = tenant.id;
      } catch {
        toaster(t('error:create_resource', { resource: t('c:tenant') }), 'error');
        return;
      }
    }

    createMutation.mutate(
      { path: { tenantId: resolvedTenantId }, body: [{ ...values, id: `temp-${generateId()}` }] },
      {
        onSuccess: (createdOrganization) => onSuccess(createdOrganization),
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
        {hasTenants && uniqueTenantCount > 1 && (
          <SelectTenantFormField control={form.control} name="tenantId" label={t('c:tenant')} required />
        )}

        <InputFormField
          control={form.control}
          name="name"
          label={t('c:name')}
          placeholder={t('c:placeholder.type_name')}
          required
        />
        <SlugFormField
          control={form.control}
          entityType="organization"
          tenantId={tenantId}
          label={t('c:resource_handle', { resource: t('c:organization') })}
          description={t('c:resource_handle.text', { resource: t('c:organization').toLowerCase() })}
          nameValue={name}
          prefix={`/${tenantId || '~'}/`}
        />

        <div className="flex flex-col gap-2 sm:flex-row">
          <SubmitButton disabled={!form.isDirty} loading={createMutation.isPending}>
            {t('c:create')}
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
              {t('c:cancel')}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
