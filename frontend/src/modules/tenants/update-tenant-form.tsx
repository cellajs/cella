import { CheckboxGroup } from '@base-ui/react/checkbox-group';
import { Field } from '@base-ui/react/field';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Tenant, UpdateTenantData } from 'sdk';
import { zUpdateTenantBody } from 'sdk/zod.gen';
import { appConfig, isStrategyEnabled } from 'shared';
import type { z } from 'zod';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { CancelButton } from '~/modules/common/form-fields/cancel-button';
import { InputFormField } from '~/modules/common/form-fields/input';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster/toaster';
import { useTenantUpdateMutation } from '~/modules/tenants/query';
import { Checkbox } from '~/modules/ui/checkbox';
import { FieldContent, FieldLabel, FieldLayout, FieldTitle, Form, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { formResolver } from '~/utils/form-resolver';

const formSchema = zUpdateTenantBody.pick({ name: true, status: true, authStrategies: true });

type FormValues = z.infer<typeof formSchema>;

interface UpdateTenantFormProps {
  tenant: Tenant;
  sheet?: boolean;
  callback?: (args: CallbackArgs<Tenant>) => void;
}

export const statusOptions = ['active', 'suspended', 'archived'] as const;

type SignInMethod = NonNullable<NonNullable<UpdateTenantData['body']>['authStrategies']>[number];

export function UpdateTenantForm({ tenant, callback, sheet: isSheet }: UpdateTenantFormProps) {
  const { t } = useTranslation();
  const { mutate, isPending } = useTenantUpdateMutation();

  // The methods a tenant may require: the enabled first factors, each OAuth provider and each federation.
  const signInMethods: { value: SignInMethod; label: string }[] = [
    ...(isStrategyEnabled('passkey') ? [{ value: 'passkey' as const, label: t('c:passkey') }] : []),
    ...(isStrategyEnabled('magic') ? [{ value: 'magic' as const, label: t('c:magic') }] : []),
    ...(isStrategyEnabled('oauth') ? appConfig.enabledOAuthProviders.map((provider) => ({ value: provider, label: t(`c:${provider}`) })) : []),
    ...(isStrategyEnabled('sso') ? Object.entries(appConfig.federations).map(([key, { label }]) => ({ value: key as SignInMethod, label })) : []),
  ];

  const formOptions: UseFormProps<FormValues> = {
    resolver: formResolver(formSchema),
    defaultValues: { name: tenant.name, status: tenant.status, authStrategies: tenant.authStrategies },
  };

  // The sheet is `update-tenant`; this form is its General section, which carries the unsaved badge.
  const sheetId = 'update-tenant';
  const formContainerId = 'update-tenant-general';
  const form = useFormWithDraft<FormValues>(`${sheetId}-${tenant.id}`, { formOptions, formContainerId });

  useBeforeUnload(form.isDirty);

  const onSubmit = (body: FormValues) => {
    mutate(
      { path: { tenantId: tenant.id }, body },
      {
        onSuccess: (updatedTenant) => {
          if (isSheet) sheeter.getState().remove(sheetId);
          form.reset(body);
          toaster.success(t('c:success.update_resource', { resource: t('c:tenant') }));
          callback?.({ data: updatedTenant, status: 'success' });
        },
      },
    );
  };

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <InputFormField control={form.control} name="name" label={t('c:name')} required />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem name="status">
              <FormLabel>{t('c:status')}</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                items={statusOptions.map((status) => ({ value: status, label: t(`c:${status}`) }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(`c:${status}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="authStrategies"
          render={({ field }) => (
            <FormItem name="authStrategies">
              <FormLabel help={t('c:allowed_sign_in_methods.text')}>{t('c:allowed_sign_in_methods')}</FormLabel>
              {/* Each checkbox sits in a `Field.Item`, so it gets its own id and label. */}
              <CheckboxGroup value={field.value ?? []} onValueChange={field.onChange} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {signInMethods.map((method) => (
                  <FieldLabel key={method.value} className="cursor-pointer">
                    <Field.Item render={<FieldLayout orientation="horizontal" />}>
                      <Checkbox value={method.value} />
                      <FieldContent>
                        <FieldTitle>{method.label}</FieldTitle>
                      </FieldContent>
                    </Field.Item>
                  </FieldLabel>
                ))}
              </CheckboxGroup>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <SubmitButton disabled={!form.isDirty} loading={isPending}>
            {t('c:save_changes')}
          </SubmitButton>
          <CancelButton dirty={form.isDirty} onClick={() => form.reset()} />
        </div>
      </form>
    </Form>
  );
}
