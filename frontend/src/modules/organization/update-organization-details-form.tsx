import { zodResolver } from '@hookform/resolvers/zod';
import { lazy, Suspense } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { zUpdateOrganizationBody } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import type { z } from 'zod';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import type BlockNoteContentFormFieldType from '~/modules/common/form-fields/blocknote';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { useOrganizationUpdateMutation } from '~/modules/organization/query';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form } from '~/modules/ui/field';
import { blocknoteFieldIsDirty } from '~/utils/blocknote-field-is-dirty';

const BlockNoteContentFormField = lazy(
  () => import('~/modules/common/form-fields/blocknote'),
) as unknown as typeof BlockNoteContentFormFieldType;

const formSchema = zUpdateOrganizationBody;

type FormValues = z.infer<typeof formSchema>;
interface Props {
  organization: Organization;
  sheet?: boolean;
  callback?: (args: CallbackArgs<Organization>) => void;
}

export function UpdateOrganizationDetailsForm({ organization, callback, sheet: isSheet }: Props) {
  const { t } = useTranslation();
  const { mutate, isPending } = useOrganizationUpdateMutation();

  const formOptions: UseFormProps<FormValues> = {
    resolver: zodResolver(formSchema),
    defaultValues: {
      welcomeText: organization.welcomeText || '',
    },
  };

  const formContainerId = 'update-organization-details';
  const form = useFormWithDraft<FormValues>(`${formContainerId}-${organization.id}`, { formOptions, formContainerId });

  // Prevent data loss
  useBeforeUnload(form.isDirty);

  const onSubmit = (body: FormValues) => {
    mutate(
      { path: { tenantId: organization.tenantId, id: organization.id }, body },
      {
        onSuccess: (updatedOrganization) => {
          if (isSheet) useSheeter.getState().remove(formContainerId);
          form.reset(body);
          toaster(t('c:success.update_resource', { resource: t('c:organization') }), 'success');
          callback?.({ data: updatedOrganization, status: 'success' });
        },
      },
    );
  };

  const isDirty = () => {
    if (!form.isDirty) return false;
    const { welcomeText } = form.getValues();
    return typeof welcomeText === 'string' && blocknoteFieldIsDirty(welcomeText);
  };

  if (form.loading) return null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" noDelay />}>
          <BlockNoteContentFormField
            control={form.control}
            name="welcomeText"
            label={t('c:introduction')}
            baseBlockNoteProps={{
              id: `${appConfig.name}-blocknote-welcome`,
              trailingBlock: false,
              className:
                'min-h-20 max-h-[50vh] overflow-auto bg-background pl-10 pr-6 p-3 border-input ring-offset-background focus-visible:ring-ring max-focus-visible:ring-transparent max-focus-visible:ring-offset-0 w-full rounded-md border text-sm focus-visible:outline-hidden sm:focus-visible:ring-2 focus-visible:ring-offset-2',
              baseFilePanelProps: { tenantId: organization.tenantId, organizationId: organization.id },
            }}
          />
        </Suspense>

        <div className="flex flex-col gap-2 sm:flex-row">
          <SubmitButton disabled={!isDirty()} loading={isPending}>
            {t('c:save_changes')}
          </SubmitButton>
          <Button
            type="reset"
            variant="secondary"
            onClick={() => form.reset()}
            className={isDirty() ? '' : 'invisible'}
          >
            {t('c:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
