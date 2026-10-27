import { useId } from 'react';
import { type UseFormProps, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { zUpdateOrganizationBody } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import { z } from 'zod';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { AvatarFormField } from '~/modules/common/form-fields/avatar';
import { CancelButton } from '~/modules/common/form-fields/cancel-button';
import { InputFormField } from '~/modules/common/form-fields/input';
import { CountryFormField } from '~/modules/common/form-fields/select-combobox/country';
import { TimezoneFormField } from '~/modules/common/form-fields/select-combobox/timezone';
import { SelectLanguage } from '~/modules/common/form-fields/select-language';
import { SelectLanguages } from '~/modules/common/form-fields/select-languages';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { useOrganizationUpdateMutation } from '~/modules/organization/query';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { formResolver } from '~/utils/form-resolver';

// welcomeText belongs to the details form
const formSchema = zUpdateOrganizationBody.omit({ welcomeText: true }).extend({
  languages: z.array(z.enum(appConfig.languages)).min(1),
  websiteUrl: z.string().max(2048).startsWith('https://').nullish(),
});

type FormValues = z.infer<typeof formSchema>;

interface UpdateOrganizationFormProps {
  organization: Organization;
  sheet?: boolean;
  callback?: (args: CallbackArgs<Organization>) => void;
}

export function UpdateOrganizationForm({ organization, callback, sheet: isSheet }: UpdateOrganizationFormProps) {
  const { t } = useTranslation();
  const { mutate, isPending } = useOrganizationUpdateMutation();
  const nameLabel = t('c:name').toLowerCase();
  const shortNameLabel = t('c:short_name').toLowerCase();
  const notificationEmailLabel = t('c:notification_email').toLowerCase();
  const languagesId = useId();

  const formOptions: UseFormProps<FormValues> = {
    resolver: formResolver(formSchema),
    defaultValues: { ...organization, languages: organization.languages || [] },
  };

  const formContainerId = 'update-organization';
  const form = useFormWithDraft<FormValues>(`${formContainerId}-${organization.id}`, { formOptions, formContainerId });

  useBeforeUnload(form.isDirty);

  const onSubmit = (body: FormValues) => {
    mutate(
      { path: { tenantId: organization.tenantId, id: organization.id }, body },
      {
        onSuccess: (updatedOrganization) => {
          if (isSheet) sheeter.getState().remove(formContainerId);
          form.reset(body);
          toaster.success(t('c:success.update_resource', { resource: t('c:organization') }));
          callback?.({ data: updatedOrganization, status: 'success' });
        },
      },
    );
  };

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <AvatarFormField
          form={form}
          label={t('c:resource_logo', { resource: t('c:organization') })}
          type="organization"
          name="thumbnailUrl"
          entity={organization}
        />
        <InputFormField
          control={form.control}
          name="name"
          label={t('c:name')}
          placeholder={t('c:placeholder.type_input', { inputLabel: nameLabel })}
          required
        />
        <InputFormField
          control={form.control}
          name="shortName"
          label={t('c:short_name')}
          placeholder={t('c:placeholder.type_input', { inputLabel: shortNameLabel })}
        />
        <SlugFormField
          control={form.control}
          entityType="organization"
          tenantId={organization.tenantId}
          label={t('c:resource_handle', { resource: t('c:organization') })}
          description={t('c:resource_handle.text', { resource: t('c:organization').toLowerCase() })}
          previousSlug={organization.slug}
          prefix={`/${organization.tenantId}/`}
        />
        <InputFormField
          control={form.control}
          type="email"
          placeholder={t('c:placeholder.your_input', { inputLabel: notificationEmailLabel })}
          name="notificationEmail"
          label={t('c:notification_email')}
          description={t('c:notification_email.text')}
        />
        <InputFormField control={form.control} name="websiteUrl" label={t('c:website_url')} placeholder="https://" type="url" />
        <FormField
          control={form.control}
          name="languages"
          render={({ field }) => (
            <FormItem name="languages">
              <FormLabel htmlFor={languagesId} required>
                {t('c:languages')}
              </FormLabel>
              <SelectLanguages id={languagesId} value={field.value ?? []} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />
        <DefaultLanguageField form={form} />

        <CountryFormField control={form.control} name="country" label={t('c:country')} />
        <TimezoneFormField control={form.control} name="timezone" label={t('c:timezone')} />

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

function DefaultLanguageField({ form }: { form: ReturnType<typeof useFormWithDraft<FormValues>> }) {
  const { t } = useTranslation();
  const languages = useWatch({ control: form.control, name: 'languages' }) || [];

  return (
    <FormField
      control={form.control}
      name="defaultLanguage"
      render={({ field }) => {
        if (form.loading) return <Spinner />;

        const correctValue = field.value && languages.includes(field.value) ? field.value : languages[0] || appConfig.defaultLanguage;

        return (
          <FormItem name="defaultLanguage">
            <FormLabel help={t('c:default_language.text')} required>
              {t('c:default_language')}
            </FormLabel>
            <SelectLanguage options={languages} value={correctValue} onChange={field.onChange} />
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
