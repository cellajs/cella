import { zodResolver } from '@hookform/resolvers/zod';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Tenant, UpdateTenantData } from 'sdk';
import { zUpdateTenantBody } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import type { z } from 'zod';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import type { TKey } from '~/lib/i18n-locales';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { InputFormField } from '~/modules/common/form-fields/input';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster/toaster';
import { useTenantUpdateMutation } from '~/modules/tenants/query';
import { Button } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';

const formSchema = zUpdateTenantBody.pick({ name: true, status: true, authStrategies: true });

type FormValues = z.infer<typeof formSchema>;

interface Props {
  tenant: Tenant;
  sheet?: boolean;
  callback?: (args: CallbackArgs<Tenant>) => void;
}

const statusOptions = ['active', 'suspended', 'archived'] as const;

type SignInMethod = NonNullable<NonNullable<UpdateTenantData['body']>['authStrategies']>[number];

/** The sign-in methods a tenant may require: the enabled first factors, each OAuth provider and each federation (labelled by config). */
const signInMethods: { value: SignInMethod; labelKey?: TKey; label?: string }[] = [
  ...(appConfig.enabledAuthStrategies.includes('passkey') ? [{ value: 'passkey' as SignInMethod, labelKey: 'c:passkey' as TKey }] : []),
  ...(appConfig.enabledAuthStrategies.includes('magic') ? [{ value: 'magic' as SignInMethod, labelKey: 'c:magic' as TKey }] : []),
  ...(appConfig.enabledAuthStrategies.includes('oauth')
    ? appConfig.enabledOAuthProviders.map((provider) => ({ value: provider as SignInMethod, labelKey: `c:${provider}` as TKey }))
    : []),
  ...(appConfig.enabledAuthStrategies.includes('sso')
    ? Object.entries(appConfig.federations).map(([key, federation]) => ({ value: key as SignInMethod, label: federation.label }))
    : []),
];

export function UpdateTenantForm({ tenant, callback, sheet: isSheet }: Props) {
  const { t } = useTranslation();
  const { mutate, isPending } = useTenantUpdateMutation();

  const formOptions: UseFormProps<FormValues> = {
    resolver: zodResolver(formSchema),
    defaultValues: { name: tenant.name, status: tenant.status, authStrategies: tenant.authStrategies },
  };

  const formContainerId = 'update-tenant';
  const form = useFormWithDraft<FormValues>(`${formContainerId}-${tenant.id}`, { formOptions, formContainerId });

  useBeforeUnload(form.isDirty);

  const onSubmit = (body: FormValues) => {
    mutate(
      { path: { tenantId: tenant.id }, body },
      {
        onSuccess: (updatedTenant) => {
          if (isSheet) useSheeter.getState().remove(formContainerId);
          form.reset(body);
          toaster.success(t('c:success.update_resource', { resource: t('c:tenant') }));
          callback?.({ data: updatedTenant, status: 'success' });
        },
      },
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
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
              <FormLabel>{t('c:allowed_sign_in_methods')}</FormLabel>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {signInMethods.map((method) => {
                  const selected = field.value ?? [];
                  const checked = selected.includes(method.value);
                  return (
                    // biome-ignore lint/a11y/noLabelWithoutControl: the Base UI checkbox renders the hidden input this label wraps
                    <label key={method.value} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          field.onChange(checked ? selected.filter((value) => value !== method.value) : [...selected, method.value])
                        }
                      />
                      {method.label ?? t(method.labelKey as TKey)}
                    </label>
                  );
                })}
              </div>
              <p className="text-muted-foreground text-sm">{t('c:allowed_sign_in_methods.text')}</p>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <SubmitButton disabled={!form.isDirty} loading={isPending}>
            {t('c:save_changes')}
          </SubmitButton>
          <Button type="reset" variant="secondary" onClick={() => form.reset()} className={form.isDirty ? '' : 'invisible'}>
            {t('c:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
