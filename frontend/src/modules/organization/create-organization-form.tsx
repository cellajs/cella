import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { type UseFormProps, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { zCreateOrganizationsBody } from 'sdk/zod.gen';
import { generateId } from 'shared/utils/entity-id';
import type { z } from 'zod';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { InputFormField } from '~/modules/common/form-fields/input';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import { useStepper } from '~/modules/common/stepper/stepper';
import { toaster } from '~/modules/common/toaster/toaster';
import { useOrganizationCreateMutation } from '~/modules/organization/query';
import { useSelfCreateTenantMutation } from '~/modules/tenants/query';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, type LabelDirectionType } from '~/modules/ui/field';

interface Props {
  dialog?: boolean;
  labelDirection?: LabelDirectionType;
  children?: React.ReactNode;
  callback?: (args: CallbackArgs<Organization>) => void;
}

// 1 tenant = 1 organization, so every org lives in its own tenant (workspace). Creating an org
// always mints a fresh tenant; there is no "add an org to an existing tenant" case to select for.
const formSchema = zCreateOrganizationsBody.element.omit({ id: true });

type FormValues = z.infer<typeof formSchema>;

/** Renders the form for creating an organization (and its tenant/workspace). */
export function CreateOrganizationForm({ labelDirection = 'top', children, callback }: Props) {
  const { t } = useTranslation();
  const { nextStep } = useStepper();
  const nameLabel = t('c:name').toLowerCase();

  const formOptions: UseFormProps<FormValues> = {
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', slug: '' },
  };

  const formContainerId = 'create-organization';
  const form = useFormWithDraft<FormValues>(formContainerId, { formOptions });

  const name = useWatch({ control: form.control, name: 'name' });

  const createMutation = useOrganizationCreateMutation();
  const selfCreateTenantMutation = useSelfCreateTenantMutation();

  const onSuccess = (createdOrganization: Organization) => {
    form.reset();
    toaster.success(t('c:success.create_resource', { resource: t('c:organization') }));
    callback?.({ data: createdOrganization, status: 'success' });
    nextStep?.();
  };

  const onSubmit = async (values: FormValues) => {
    // Each org gets its own tenant. Mint it first, then create the org inside it.
    let tenantId: string;
    try {
      const tenant = await selfCreateTenantMutation.mutateAsync({ name: `${values.name} workspace` });
      tenantId = tenant.id;
    } catch {
      toaster.error(t('error:create_resource', { resource: t('c:tenant') }));
      return;
    }

    createMutation.mutate(
      { path: { tenantId }, body: [{ ...values, id: `temp-${generateId()}` }] },
      {
        onSuccess: (createdOrganization) => onSuccess(createdOrganization),
        onError: (error) => {
          if (error.message === 'org_limit_reached') {
            toaster.warning(t('error:org_limit_reached'));
          }
        },
      },
    );
  };

  return (
    <Form {...form} labelDirection={labelDirection}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <InputFormField
          control={form.control}
          name="name"
          label={t('c:name')}
          placeholder={t('c:placeholder.type_input', { inputLabel: nameLabel })}
          required
        />
        <SlugFormField
          control={form.control}
          entityType="organization"
          tenantId=""
          label={t('c:resource_handle', { resource: t('c:organization') })}
          description={t('c:resource_handle.text', { resource: t('c:organization').toLowerCase() })}
          nameValue={name}
          prefix="/~/"
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
