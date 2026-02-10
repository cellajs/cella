import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { useMemo } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import type { Tenant } from '~/api.gen';
import { zCreateTenantBody } from '~/api.gen/zod.gen';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { InputFormField } from '~/modules/common/form-fields/input';
import { toaster } from '~/modules/common/toaster/service';
import { useTenantCreateMutation } from '~/modules/tenants/query';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, type LabelDirectionType } from '~/modules/ui/form';

interface Props {
  dialog?: boolean;
  labelDirection?: LabelDirectionType;
  children?: React.ReactNode;
  callback?: (args: CallbackArgs<Tenant>) => void;
}

const formSchema = zCreateTenantBody.extend({
  name: z.string().min(1, 'error:form.required').max(255),
});
type FormValues = z.infer<typeof formSchema>;

/** Form to create a new tenant. */
export function CreateTenantForm({ labelDirection = 'top', children, callback }: Props) {
  const { t } = useTranslation();

  const defaultValues: FormValues = { name: '' };
  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues,
    }),
    [],
  );

  const formContainerId = 'create-tenant';
  const form = useFormWithDraft<FormValues>(formContainerId, { formOptions });

  const { mutate, isPending } = useTenantCreateMutation();

  const onSubmit = (values: FormValues) => {
    mutate(values, {
      onSuccess: (createdTenant) => {
        form.reset();
        toaster(t('common:success.create_resource', { resource: t('common:tenant') }), 'success');
        callback?.({ data: createdTenant, status: 'success' });
      },
    });
  };

  return (
    <Form {...form} labelDirection={labelDirection}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <InputFormField control={form.control} name="name" label={t('common:name')} required />

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
