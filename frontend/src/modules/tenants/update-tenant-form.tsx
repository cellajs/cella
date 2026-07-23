import { zodResolver } from '@hookform/resolvers/zod';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Tenant } from 'sdk';
import { zUpdateTenantBody } from 'sdk/zod.gen';
import type { z } from 'zod';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { InputFormField } from '~/modules/common/form-fields/input';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster/toaster';
import { useTenantUpdateMutation } from '~/modules/tenants/query';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';

const formSchema = zUpdateTenantBody.pick({ name: true, status: true });

type FormValues = z.infer<typeof formSchema>;

interface Props {
  tenant: Tenant;
  sheet?: boolean;
  callback?: (args: CallbackArgs<Tenant>) => void;
}

const statusOptions = ['active', 'suspended', 'archived'] as const;

export function UpdateTenantForm({ tenant, callback, sheet: isSheet }: Props) {
  const { t } = useTranslation();
  const { mutate, isPending } = useTenantUpdateMutation();

  const formOptions: UseFormProps<FormValues> = {
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: tenant.name,
      status: tenant.status,
    },
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <InputFormField control={form.control} name="name" label={t('c:name')} required />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem name="status">
              <FormLabel>{t('c:status')}</FormLabel>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange}>
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
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <SubmitButton disabled={!form.isDirty} loading={isPending}>
            {t('c:save_changes')}
          </SubmitButton>
          <Button
            type="reset"
            variant="secondary"
            onClick={() => form.reset()}
            className={form.isDirty ? '' : 'invisible'}
          >
            {t('c:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
