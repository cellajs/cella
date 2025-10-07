import { zodResolver } from '@hookform/resolvers/zod';
import { lazy, Suspense } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import type { Organization } from '~/api.gen';
import { zUpdateOrganizationData } from '~/api.gen/zod.gen';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import Spinner from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/service';
import { useOrganizationUpdateMutation } from '~/modules/organizations/query';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';
import { blocknoteFieldIsDirty } from '~/utils/blocknote-field-is-dirty';

const BlockNoteContent = lazy(() => import('~/modules/common/form-fields/blocknote-content'));

const formSchema = zUpdateOrganizationData.shape.body.unwrap();

type FormValues = z.infer<typeof formSchema>;
interface Props {
  organization: Organization;
  sheet?: boolean;
  callback?: (organization: Organization) => void;
}

const UpdateOrganizationDetailsForm = ({ organization, callback, sheet: isSheet }: Props) => {
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
      { idOrSlug: organization.slug, body },
      {
        onSuccess: (updatedOrganization) => {
          if (isSheet) useSheeter.getState().remove(formContainerId);
          form.reset(body);
          toaster(t('common:success.update_resource', { resource: t('common:organization') }), 'success');
          callback?.(updatedOrganization);
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
          <BlockNoteContent
            control={form.control}
            name="welcomeText"
            label={t('common:introduction')}
            baseBlockNoteProps={{
              id: 'blocknote-welcome',
              trailingBlock: false,
              className:
                'min-h-20 max-h-[50vh] overflow-auto bg-background pl-10 pr-6 p-3 border-input ring-offset-background focus-visible:ring-ring/50 max-focus-visible:ring-transparent max-focus-visible:ring-offset-0 flex w-full rounded-md border text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-hidden sm:focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              baseFilePanelProps: { organizationId: organization.id },
            }}
          />
        </Suspense>

        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton disabled={!isDirty()} loading={isPending}>
            {t('common:save_changes')}
          </SubmitButton>
          <Button type="reset" variant="secondary" onClick={() => form.reset()} className={isDirty() ? '' : 'invisible'}>
            {t('common:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default UpdateOrganizationDetailsForm;
