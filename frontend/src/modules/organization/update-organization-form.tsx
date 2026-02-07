import { zodResolver } from '@hookform/resolvers/zod';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import type { z } from 'zod';
import type { Organization } from '~/api.gen';
import { zUpdateOrganizationData } from '~/api.gen/zod.gen';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { CallbackArgs } from '~/modules/common/data-table/types';
import { AvatarFormField } from '~/modules/common/form-fields/avatar';
import { DomainsFormField } from '~/modules/common/form-fields/domains';
import { InputFormField } from '~/modules/common/form-fields/input';
import { SelectCountry } from '~/modules/common/form-fields/select-combobox/country';
import { SelectTimezone } from '~/modules/common/form-fields/select-combobox/timezone';
import { SelectLanguage } from '~/modules/common/form-fields/select-language';
import { SelectLanguages } from '~/modules/common/form-fields/select-languages';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/service';
import { useOrganizationUpdateMutation } from '~/modules/organization/query';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';

const formSchema = zUpdateOrganizationData.shape.body.unwrap();

type FormValues = z.infer<typeof formSchema>;
interface Props {
  organization: Organization | Organization;
  sheet?: boolean;
  callback?: (args: CallbackArgs<Organization>) => void;
}

export function UpdateOrganizationForm({ organization, callback, sheet: isSheet }: Props) {
  const { t } = useTranslation();
  const { mutate, isPending } = useOrganizationUpdateMutation();

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
      { id: organization.id, body },
      {
        onSuccess: (updatedOrganization) => {
          if (isSheet) useSheeter.getState().remove(formContainerId);
          form.reset(body);
          toaster(t('common:success.update_resource', { resource: t('common:organization') }), 'success');
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
          label={t('common:resource_logo', { resource: t('common:organization') })}
          type="organization"
          name="thumbnailUrl"
          entity={organization}
        />
        <InputFormField control={form.control} name="name" label={t('common:name')} required />
        <InputFormField control={form.control} name="shortName" label={t('common:short_name')} required />
        <SlugFormField
          control={form.control}
          entityType="organization"
          label={t('common:resource_handle', { resource: t('common:organization') })}
          description={t('common:resource_handle.text', { resource: t('common:organization').toLowerCase() })}
          previousSlug={organization.slug}
        />
        <DomainsFormField
          control={form.control}
          name="emailDomains"
          label={t('common:email_domains')}
          description={t('common:email_domains.text')}
        />
        <InputFormField
          control={form.control}
          type="email"
          placeholder={t('common:placeholder.your_email')}
          name="notificationEmail"
          label={t('common:notification_email')}
          description={t('common:notification_email.text')}
        />
        <InputFormField
          control={form.control}
          name="websiteUrl"
          label={t('common:website_url')}
          placeholder="https://"
          type="url"
        />
        <FormField
          control={form.control}
          name="languages"
          render={({ field }) => (
            <FormItem name="languages">
              <FormLabel>
                {t('common:languages')}
                <span className="ml-1 opacity-50">*</span>
              </FormLabel>
              <FormControl>
                <SelectLanguages value={field.value ?? []} onChange={field.onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="defaultLanguage"
          render={({ field }) => {
            // Make sure languages are loaded
            if (form.loading) return <Spinner />;

            // If defaultLanguage is not selected languages, set first language
            const languages = form.getValues('languages') || [];
            const correctValue =
              field.value && languages.includes(field.value) ? field.value : languages[0] || appConfig.defaultLanguage;

            return (
              <FormItem name="defaultLanguage">
                <FormLabel>
                  {t('common:default_language')}
                  <span className="ml-1 opacity-50">*</span>
                </FormLabel>
                <FormDescription>{t('common:default_language.text')}</FormDescription>
                <FormControl>
                  <SelectLanguage
                    options={form.getValues('languages') || []}
                    value={correctValue}
                    onChange={(val) => field.onChange(val)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <SelectCountry control={form.control} name="country" label={t('common:country')} />
        <SelectTimezone control={form.control} name="timezone" label={t('common:timezone')} />

        {/* NOT IN USE ATM <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="group w-full font-normal opacity-70 hover:opacity-100" size="sm">
              <UnfoldVertical size={16} className="group-data-[state=open]:hidden" />
              <FoldVertical size={16} className="hidden group-data-[state=open]:block" />
              <span className="ml-2">
                <span className="block group-data-[state=open]:hidden">{t('common:show_advanced_settings')}</span>
                <span className="hidden group-data-[state=open]:block">{t('common:hide_advanced_settings')}</span>
              </span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className='mt-3 flex flex-col gap-4'>
          </CollapsibleContent>
        </Collapsible> */}

        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton disabled={!form.isDirty} loading={isPending}>
            {t('common:save_changes')}
          </SubmitButton>
          <Button
            type="reset"
            variant="secondary"
            onClick={() => form.reset()}
            className={form.isDirty ? '' : 'invisible'}
          >
            {t('common:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
