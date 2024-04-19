import { zodResolver } from '@hookform/resolvers/zod';
import { type DefaultError, useMutation } from '@tanstack/react-query';
import { updateOrganizationJsonSchema } from 'backend/modules/organizations/schema';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { type UpdateOrganizationParams, updateOrganization } from '~/api/organizations';
import type { Organization } from '~/types';

import { Loader2, Undo } from 'lucide-react';
import { Suspense, lazy, useEffect } from 'react';
import { useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { queryClient } from '~/lib/router';
import { cleanUrl } from '~/lib/utils';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import AvatarFormField from '../common/form-fields/avatar';
import InputFormField from '../common/form-fields/input';
import LanguageFormField from '../common/form-fields/language';
import { SlugFormField } from '../common/form-fields/slug';
import DomainsFormField from '../common/form-fields/domains';

const SelectCountry = lazy(() => import('~/modules/common/form-fields/select-country'));
const SelectTimezone = lazy(() => import('~/modules/common/form-fields/select-timezone'));

interface Props {
  organization: Organization;
  callback?: (organization: Organization) => void;
  dialog?: boolean;
}

const formSchema = updateOrganizationJsonSchema;

type FormValues = z.infer<typeof formSchema>;

export const useUpdateOrganizationMutation = (idOrSlug: string) => {
  return useMutation<Organization, DefaultError, UpdateOrganizationParams>({
    mutationKey: ['organizations', 'update', idOrSlug],
    mutationFn: (params) => updateOrganization(idOrSlug, params),
    onSuccess: (organization) => {
      queryClient.setQueryData(['organizations', idOrSlug], organization);
    },
    gcTime: 1000 * 10,
  });
};

const UpdateOrganizationForm = ({ organization, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();
  const { mutate, isPending } = useUpdateOrganizationMutation(organization.id);

  const form = useFormWithDraft<FormValues>(`update-organization-${organization.id}`, {
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
  });

  const slug = useWatch({
    control: form.control,
    name: 'slug',
  });

  // Prevent data loss
  useBeforeUnload(form.formState.isDirty);

  const onSubmit = (values: FormValues) => {
    mutate(values, {
      onSuccess: (data) => {
        callback?.(data);
        if (isDialog) {
          dialog.remove();
        }
        toast.success(t('common:success.update_organization'));
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
    if (languages && !languages.includes(defaultLanguage as string)) {
      form.setValue('defaultLanguage', languages[0] as typeof defaultLanguage);
    }
  }, [languages, defaultLanguage]);

  const cancel = () => {
    form.reset();
    isDialog && dialog.remove();
  };

  const setImageUrl = (url: string) => {
    form.setValue('thumbnailUrl', url, { shouldDirty: true });
  };

  const revertSlug = () => {
    form.resetField('slug');
  };

  useEffect(() => {
    if (form.formState.isSubmitSuccessful) {
      form.reset(form.getValues());
    }
  }, [form.formState.isSubmitSuccessful]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <AvatarFormField
          control={form.control}
          label={t('common:organization_logo')}
          type="ORGANIZATION"
          name="thumbnailUrl"
          entity={organization}
          url={form.getValues('thumbnailUrl')}
          setUrl={setImageUrl}
        />
        <InputFormField control={form.control} name="name" label={t('common:name')} required />
        <SlugFormField
          control={form.control}
          name="slug"
          label={t('common:organization_handle')}
          required
          description={t('common:organization_handle.text')}
          errorMessage={t('common:error.slug_exists')}
          previousSlug={organization.slug}
          subComponent={
            organization.slug !== slug && (
              <div className="absolute inset-y-1 right-1 flex justify-end">
                <Button variant="ghost" size="sm" aria-label={t('common:revert_handle')} onClick={revertSlug} className="h-full">
                  <Undo size={16} className="mr-2" /> {t('common:revert_to')} <strong className="ml-1">{organization.slug}</strong>
                </Button>
              </div>
            )
          }
        />
        <InputFormField control={form.control} name="shortName" label={t('common:short_name')} required />
        <DomainsFormField
          control={form.control}
          name="emailDomains"
          label={t('common:email_domains')}
          description={t('common:email_domains.text')}
          placeholder={t('common:placeholder.email_domains')}
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
        <LanguageFormField
          control={form.control}
          name="languages"
          label={t('common:languages')}
          mode="multiple"
          placeholder={t('common:placeholder.select_languages')}
          emptyIndicator={t('common:empty_languages')}
          required
        />
        <LanguageFormField
          control={form.control}
          name="defaultLanguage"
          label={t('common:default_language')}
          description={t('common:default_language.text')}
          placeholder={t('common:placeholder.select_language')}
          disabledItemFunction={(value) => !form.getValues('languages')?.includes(value)}
          required
        />
        <FormField
          control={form.control}
          name="timezone"
          render={({ field: { value, onChange } }) => (
            <FormItem name="timezone">
              <FormLabel>{t('common:timezone')}</FormLabel>
              <FormControl>
                <Suspense fallback={<Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />}>
                  <SelectTimezone onChange={onChange} value={value || ''} />
                </Suspense>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="country"
          render={({ field: { value, onChange } }) => (
            <FormItem name="country">
              <FormLabel>{t('common:country')}</FormLabel>
              <FormControl>
                <Suspense fallback={<Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />}>
                  <SelectCountry onChange={onChange} value={value || ''} />
                </Suspense>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="submit" disabled={!form.formState.isDirty} loading={isPending}>
            {t('common:save_changes')}
          </Button>
          <Button type="reset" variant="secondary" onClick={cancel} className={form.formState.isDirty ? '' : 'sm:invisible'}>
            {t('common:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default UpdateOrganizationForm;
