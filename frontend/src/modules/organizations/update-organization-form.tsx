import { zodResolver } from '@hookform/resolvers/zod';
import { type DefaultError, onlineManager, useMutation } from '@tanstack/react-query';
import { updateOrganizationBodySchema } from 'backend/modules/organizations/schema';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { type UpdateOrganizationParams, updateOrganization } from '~/api/organizations';
import type { Organization } from '~/types/common';

import { config } from 'config';
import { useEffect } from 'react';
import { type UseFormProps, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { queryClient } from '~/lib/router';
import { showToast } from '~/lib/toasts';
import AvatarFormField from '~/modules/common/form-fields/avatar';
import DomainsFormField from '~/modules/common/form-fields/domains';
import InputFormField from '~/modules/common/form-fields/input';
import { SelectLanguage, SelectLanguages } from '~/modules/common/form-fields/language-selector';
import SelectCountry from '~/modules/common/form-fields/select-country';
import SelectTimezone from '~/modules/common/form-fields/select-timezone';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import { sheet } from '~/modules/common/sheeter/state';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { cleanUrl } from '~/utils/utils';

interface Props {
  organization: Organization;
  callback?: (organization: Organization) => void;
  sheet?: boolean;
}

const formSchema = updateOrganizationBodySchema;

type FormValues = z.infer<typeof formSchema>;

export const useUpdateOrganizationMutation = (idOrSlug: string) => {
  return useMutation<Organization, DefaultError, UpdateOrganizationParams>({
    mutationKey: ['organizations', 'update', idOrSlug],
    mutationFn: (params) => updateOrganization(idOrSlug, params),
    onSuccess: (updatedOrganization) => {
      queryClient.setQueryData(['organizations', idOrSlug], updatedOrganization);
      queryClient.invalidateQueries({
        queryKey: ['organizations'],
      });
    },
    gcTime: 1000 * 10,
  });
};

const UpdateOrganizationForm = ({ organization, callback, sheet: isSheet }: Props) => {
  const { t } = useTranslation();
  const { mutate, isPending } = useUpdateOrganizationMutation(organization.id);

  const formOptions: UseFormProps<FormValues> = {
    resolver: zodResolver(formSchema),
    defaultValues: {
      slug: organization.slug,
      name: organization.name,
      shortName: organization.shortName,
      websiteUrl: organization.websiteUrl,
      emailDomains: organization.emailDomains,
      thumbnailUrl: cleanUrl(organization.thumbnailUrl),
      notificationEmail: organization.notificationEmail,
      timezone: organization.timezone,
      country: organization.country,
      defaultLanguage: organization.defaultLanguage,
      languages: organization.languages || [],
    },
  };

  const form = useFormWithDraft<FormValues>(`update-organization-${organization.id}`, formOptions);

  // Prevent data loss
  useBeforeUnload(form.formState.isDirty);

  const onSubmit = (values: FormValues) => {
    if (!onlineManager.isOnline()) return toast.warning(t('common:action.offline.text'));

    mutate(values, {
      onSuccess: (updatedOrganization) => {
        if (isSheet) sheet.remove('update-organization');
        form.reset(updatedOrganization);
        showToast(t('common:success.update_resource', { resource: t('common:organization') }), 'success');
        callback?.(updatedOrganization);
      },
    });
  };

  const languages = useWatch({
    control: form.control,
    name: 'languages',
  });

  const defaultLanguage = useWatch({
    control: form.control,
    name: 'defaultLanguage',
  });

  useEffect(() => {
    if (languages && ((defaultLanguage && !languages.includes(defaultLanguage)) || !defaultLanguage)) {
      form.setValue('defaultLanguage', languages[0]);
    }
  }, [languages, defaultLanguage]);

  const setImageUrl = (url: string) => {
    form.setValue('thumbnailUrl', url, { shouldDirty: true });
  };

  useEffect(() => {
    if (form.unsavedChanges) {
      const targetSheet = sheet.get('update-organization');
      if (targetSheet && targetSheet.title?.type?.name !== 'UnsavedBadge') {
        sheet.update('update-organization', {
          title: <UnsavedBadge title={targetSheet?.title} />,
        });
      }
      return;
    }
  }, [form.unsavedChanges]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {!isSheet && form.unsavedChanges && <UnsavedBadge />}
        <AvatarFormField
          control={form.control}
          label={t('common:resource_logo', { resource: t('common:organization') })}
          type="organization"
          name="thumbnailUrl"
          entity={organization}
          url={form.getValues('thumbnailUrl')}
          setUrl={setImageUrl}
        />
        <InputFormField control={form.control} name="name" label={t('common:name')} required />
        <SlugFormField
          control={form.control}
          type="organization"
          label={t('common:resource_handle', { resource: t('common:organization') })}
          description={t('common:resource_handle.text', { resource: t('common:organization').toLowerCase() })}
          previousSlug={organization.slug}
        />
        <InputFormField control={form.control} name="shortName" label={t('common:short_name')} required />
        <DomainsFormField
          control={form.control}
          label={t('common:email_domains')}
          description={t('common:email_domains.text', { domain: config.domain })}
        />
        <InputFormField
          control={form.control}
          type="email"
          placeholder={t('common:placeholder.your_email')}
          name="notificationEmail"
          label={t('common:notification_email')}
          description={t('common:notification_email.text')}
        />
        <InputFormField control={form.control} name="websiteUrl" label={t('common:website_url')} placeholder="https://" type="url" />
        <FormField
          control={form.control}
          name="languages"
          render={({ field: { onChange } }) => (
            <FormItem name="languages">
              <FormLabel>
                {t('common:languages')}
                <span className="ml-1 opacity-50">*</span>
              </FormLabel>
              <FormControl>
                <SelectLanguages onChange={onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="defaultLanguage"
          render={({ field: { onChange } }) => (
            <FormItem name="defaultLanguage">
              <FormLabel>
                {t('common:default_language')}
                <span className="ml-1 opacity-50">*</span>
              </FormLabel>
              <FormDescription>{t('common:default_language.text')}</FormDescription>
              <FormControl>
                <SelectLanguage
                  name="defaultLanguage"
                  onChange={onChange}
                  disabledItemFunction={(value) => !form.getValues('languages')?.includes(value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="country"
          render={({ field: { onChange } }) => (
            <FormItem name="country">
              <FormLabel>{t('common:country')}</FormLabel>
              <FormControl>
                <SelectCountry onChange={onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="timezone"
          render={({ field: { onChange } }) => (
            <FormItem name="timezone">
              <FormLabel>{t('common:timezone')}</FormLabel>
              <FormControl>
                <SelectTimezone onChange={onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="submit" disabled={!form.formState.isDirty} loading={isPending}>
            {t('common:save_changes')}
          </Button>
          <Button type="reset" variant="secondary" onClick={() => form.reset()} className={form.formState.isDirty ? '' : 'invisible'}>
            {t('common:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default UpdateOrganizationForm;
