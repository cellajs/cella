import { zodResolver } from '@hookform/resolvers/zod';
import i18n from 'i18next';
import type { UseFormProps } from 'react-hook-form';
import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { zUpdateOrganizationBody } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import { z } from 'zod';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { AvatarFormField } from '~/modules/common/form-fields/avatar';
import { InputFormField } from '~/modules/common/form-fields/input';
import { SelectCountry } from '~/modules/common/form-fields/select-combobox/country';
import { SelectTimezone } from '~/modules/common/form-fields/select-combobox/timezone';
import { SelectLanguage } from '~/modules/common/form-fields/select-language';
import { SelectLanguages } from '~/modules/common/form-fields/select-languages';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { useOrganizationUpdateMutation } from '~/modules/organization/query';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';

// Override generated schema: omit fields not managed by this form (welcomeText is in details form),
// transform empty strings to null for optional fields, and add https:// validation for websiteUrl
const formSchema = zUpdateOrganizationBody.omit({ welcomeText: true }).extend({
  languages: z.array(z.enum(appConfig.languages)).min(1),
  websiteUrl: z
    .string()
    .max(2048)
    .refine((v) => v === '' || v.startsWith('https://'), { message: i18n.t('error:invalid_url') })
    .transform((v) => (v.trim() === '' ? null : v))
    .nullable()
    .optional(),
});

type FormValues = z.infer<typeof formSchema>;
interface Props {
  organization: Organization | Organization;
  sheet?: boolean;
  callback?: (args: CallbackArgs<Organization>) => void;
}

export function UpdateOrganizationForm({ organization, callback, sheet: isSheet }: Props) {
  const { t } = useTranslation();
  const { mutate, isPending } = useOrganizationUpdateMutation();
  const nameLabel = t('c:name').toLowerCase();
  const shortNameLabel = t('c:short_name').toLowerCase();
  const notificationEmailLabel = t('c:notification_email').toLowerCase();

  const formOptions: UseFormProps<FormValues> = {
    resolver: zodResolver(formSchema),
    defaultValues: {
      ...organization,
      languages: organization.languages || [],
    },
  };

  const formContainerId = 'update-organization';
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
          toaster.success(t('c:success.update_resource', { resource: t('c:organization') }));
          callback?.({ data: updatedOrganization, status: 'success' });
        },
      },
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
          required
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
        <InputFormField
          control={form.control}
          name="websiteUrl"
          label={t('c:website_url')}
          placeholder="https://"
          type="url"
        />
        <FormField
          control={form.control}
          name="languages"
          render={({ field }) => (
            <FormItem name="languages">
              <FormLabel>
                {t('c:languages')}
                <span className="ml-1 opacity-50">*</span>
              </FormLabel>
              <SelectLanguages value={field.value ?? []} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />
        <DefaultLanguageField form={form} />

        <SelectCountry control={form.control} name="country" label={t('c:country')} />
        <SelectTimezone control={form.control} name="timezone" label={t('c:timezone')} />

        {/* NOT IN USE ATM <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="group w-full font-normal opacity-70 hover:opacity-100" size="sm">
              <UnfoldVertical size={16} className="group-data-[state=open]:hidden" />
              <FoldVertical size={16} className="hidden group-data-[state=open]:block" />
              <span className="ml-2">
                <span className="block group-data-[state=open]:hidden">{t('c:show_advanced_settings')}</span>
                <span className="hidden group-data-[state=open]:block">{t('c:hide_advanced_settings')}</span>
              </span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className='mt-3 flex flex-col gap-4'>
          </CollapsibleContent>
        </Collapsible> */}

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

function DefaultLanguageField({ form }: { form: ReturnType<typeof useFormWithDraft<FormValues>> }) {
  const { t } = useTranslation();
  const languages = useWatch({ control: form.control, name: 'languages' }) || [];

  return (
    <FormField
      control={form.control}
      name="defaultLanguage"
      render={({ field }) => {
        if (form.loading) return <Spinner />;

        const correctValue =
          field.value && languages.includes(field.value) ? field.value : languages[0] || appConfig.defaultLanguage;

        return (
          <FormItem name="defaultLanguage">
            <FormLabel>
              {t('c:default_language')}
              <span className="ml-1 opacity-50">*</span>
            </FormLabel>
            <FormDescription>{t('c:default_language.text')}</FormDescription>
            <SelectLanguage options={languages} value={correctValue} onChange={(val) => field.onChange(val)} />
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
