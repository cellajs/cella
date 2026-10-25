import i18n from 'i18next';
import type React from 'react';
import { type UseFormProps, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { zCreateOrganizationsBody } from 'sdk/zod.gen';
import { hierarchy } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { z } from 'zod';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { dialoger, type TriggerRef } from '~/modules/common/dialoger/use-dialoger';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { CancelButton } from '~/modules/common/form-fields/cancel-button';
import { InputFormField } from '~/modules/common/form-fields/input';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { toaster } from '~/modules/common/toaster/toaster';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { prepareRolesText } from '~/modules/entities/draft-roles';
import { useOrganizationCreateMutation } from '~/modules/organization/query';
import { useSelfCreateTenantMutation } from '~/modules/tenants/query';
import { Form, FormField, FormItem, FormLabel } from '~/modules/ui/field';
import { Switch } from '~/modules/ui/switch';
import { formResolver } from '~/utils/form-resolver';

interface CreateOrganizationFormProps {
  /** Closes the create dialog once the organization is saved. */
  dialog?: boolean;
  children?: React.ReactNode;
  callback?: (args: CallbackArgs<Organization>) => void;
}

const formSchema = zCreateOrganizationsBody.element.omit({ id: true });

type FormValues = z.infer<typeof formSchema>;

const formContainerId = 'create-organization';

export function CreateOrganizationForm({ dialog: isDialog, children, callback }: CreateOrganizationFormProps) {
  const { t } = useTranslation();
  const { nextStep } = useStepper();
  const nameLabel = t('c:name').toLowerCase();

  const formOptions: UseFormProps<FormValues> = { resolver: formResolver(formSchema), defaultValues: { name: '', slug: '', draft: false } };

  const form = useFormWithDraft<FormValues>(formContainerId, { formOptions });

  const name = useWatch({ control: form.control, name: 'name' });

  const createMutation = useOrganizationCreateMutation();
  const selfCreateTenantMutation = useSelfCreateTenantMutation();

  const onSuccess = (createdOrganization: Organization) => {
    form.reset();
    toaster.success(t('c:success.create_resource', { resource: t('c:organization') }));
    if (isDialog) dialoger.getState().remove(formContainerId);
    callback?.({ data: createdOrganization, status: 'success' });
    nextStep();
  };

  // 1 tenant = 1 organization: the submit mints a fresh tenant, then creates the organization in it.
  const onSubmit = async (values: FormValues) => {
    let tenantId: string;
    try {
      const tenant = await selfCreateTenantMutation.mutateAsync({ name: `${values.name} workspace` });
      tenantId = tenant.id;
    } catch {
      // The global error handler says what went wrong
      return;
    }

    createMutation.mutate({ path: { tenantId }, body: [{ ...values, id: `temp-${generateId()}` }] }, { onSuccess });
  };

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
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
        {hierarchy.canDraft('organization') && (
          <FormField
            control={form.control}
            name="draft"
            render={({ field }) => (
              <FormItem name="draft" className="flex flex-row items-center gap-3">
                <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                <div>
                  <FormLabel help={t('c:start_as_draft.text', { prepareRoles: prepareRolesText('organization') })}>{t('c:start_as_draft')}</FormLabel>
                </div>
              </FormItem>
            )}
          />
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <SubmitButton disabled={!form.isDirty} loading={selfCreateTenantMutation.isPending || createMutation.isPending}>
            {t('c:create')}
          </SubmitButton>
          {children}

          {!children && <CancelButton dirty={form.isDirty} onClick={() => form.reset()} />}
        </div>
      </form>
    </Form>
  );
}

/** Opens the create dialog; `onCreated` receives the saved organization. */
export function openCreateOrganizationDialog(triggerRef: TriggerRef, onCreated?: (organization: Organization) => void) {
  const title = i18n.t('c:create_resource', { resource: i18n.t('c:organization').toLowerCase() });
  const callback = (args: CallbackArgs<Organization>) => {
    if (args.status === 'success') onCreated?.(args.data);
  };

  dialoger.getState().create(<CreateOrganizationForm dialog callback={callback} />, {
    id: formContainerId,
    triggerRef,
    className: 'md:max-w-2xl',
    title,
    titleContent: <UnsavedBadge title={title} />,
    description: i18n.t('c:create_organization.text'),
  });
}
