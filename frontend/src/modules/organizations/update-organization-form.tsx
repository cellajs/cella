import { zodResolver } from '@hookform/resolvers/zod';
import { updateOrganizationJsonSchema } from 'backend/modules/organizations/schema';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import CountryFlag from '~/modules/common/country-flag';
import { Organization } from '~/types';

import { config } from 'config';
import { Undo } from 'lucide-react';
import { useEffect } from 'react';
import { useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { checkSlug } from '~/api/general';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import countries from '~/lib/countries.json';
import timezones from '~/lib/timezones.json';
import { cleanUrl } from '~/lib/utils';
import { dialog } from '~/modules/common/dialoger/state';
import { UploadAvatar } from '~/modules/common/upload/upload-avatar';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { useUpdateOrganizationMutation } from '~/router/routeTree';
import MultipleSelector from '../ui/multiple-selector';

interface Props {
  organization: Organization;
  callback?: (organization: Organization) => void;
  dialog?: boolean;
}

const formSchema = updateOrganizationJsonSchema;

type FormValues = z.infer<typeof formSchema>;

const UpdateOrganizationForm = ({ organization, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();
  const [apiWrapper, apiPending] = useApiWrapper();
  const { mutate, isPending } = useUpdateOrganizationMutation(organization.id);

  const form = useFormWithDraft<FormValues>(`update-organization-${organization.id}`, {
    resolver: zodResolver(formSchema),
    defaultValues: {
      slug: organization.slug,
      name: organization.name,
      shortName: organization.shortName,
      websiteUrl: organization.websiteUrl,
      thumbnailUrl: cleanUrl(organization.thumbnailUrl),
      notificationEmail: organization.shortName,
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
        form.reset(data);
        callback?.(data);
        if (isDialog) {
          dialog.remove();
        }
        toast.success(t('common:success.update_organization'));
      },
    });
  };

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
    if (slug && slug !== organization.slug) {
      apiWrapper(
        () => checkSlug(slug),
        (isExists) => {
          if (isExists) {
            form.setError('slug', {
              type: 'manual',
              message: t('common:error.slug_already_exists'),
            });
          } else {
            form.clearErrors('slug');
          }
        },
      );
    }
  }, [slug]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="thumbnailUrl"
          render={({ field: { ref, ...rest } }) => (
            <FormItem>
              <FormLabel>{t('common:organization_logo')}</FormLabel>
              <FormControl>
                <UploadAvatar
                  {...rest}
                  type="organization"
                  id={organization.id}
                  name={organization.name}
                  url={form.getValues('thumbnailUrl')}
                  setUrl={setImageUrl}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('common:organization_handle')}</FormLabel>
              <FormDescription>{t('common:text.organization_handle')}</FormDescription>
              <FormControl>
                {/* TODO: This breaks accessibility of the form label? */}
                <div className="relative">
                  <Input {...field} />
                  {organization.slug !== slug && (
                    <div className="absolute inset-y-1 right-1 flex justify-end">
                      <Button variant="ghost" size="sm" aria-label={t('common:revert_handle')} onClick={revertSlug} className="h-full">
                        <Undo size={16} className="mr-2" /> {t('common:revert_to')} <strong className="ml-1">{organization.slug}</strong>
                      </Button>
                    </div>
                  )}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('common:name')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="shortName"
          render={({ field: { value, ...rest } }) => (
            <FormItem>
              <FormLabel>{t('common:short_name')}</FormLabel>
              <FormControl>
                <Input value={value ?? ''} {...rest} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notificationEmail"
          render={({ field: { value, ...rest } }) => (
            <FormItem>
              <FormLabel>{t('common:notification_email')}</FormLabel>
              <FormDescription>{t('common:text.notification_email')}</FormDescription>
              <FormControl>
                <Input type="email" value={value ?? ''} {...rest} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="websiteUrl"
          render={({ field: { value, ...rest } }) => (
            <FormItem>
              <FormLabel>{t('common:website_url')}</FormLabel>
              <FormControl>
                <Input placeholder="https://" type="url" value={value ?? ''} {...rest} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="languages"
          render={({ field: { value, onChange } }) => (
            <FormItem>
              <FormLabel>{t('common:languages')}</FormLabel>
              <FormControl>
                <MultipleSelector
                  value={config.languages.filter((language) => value?.includes(language.value))}
                  onChange={(value) => {
                    onChange(value.map((language) => language.value));
                  }}
                  defaultOptions={config.languages}
                  placeholder={t('common:select')}
                  emptyIndicator={t('common:empty_languages')}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="defaultLanguage"
          render={({ field: { value, onChange } }) => (
            <FormItem>
              <FormLabel>{t('common:default_language')}</FormLabel>
              <FormDescription>{t('common:text.default_language')}</FormDescription>
              <FormControl>
                <Select onValueChange={onChange} value={value || ''}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('common:select_language')} />
                  </SelectTrigger>
                  <SelectContent>
                    {config.languages.map((language: { value: string; label: string }) => (
                      <SelectItem key={language.value} value={language.value} disabled={!form.getValues('languages')?.includes(language.value)}>
                        <CountryFlag countryCode={language.value} imgType="png" className="mr-2" />
                        {language.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="timezone"
          render={({ field: { value, onChange } }) => (
            <FormItem>
              <FormLabel>{t('common:timezone')}</FormLabel>
              <FormControl>
                <Select onValueChange={onChange} value={value || ''}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a timezone" />
                  </SelectTrigger>
                  <SelectContent className="h-[300px]">
                    {timezones.map((timezone) => (
                      <SelectItem key={timezone.text} value={timezone.text}>
                        {timezone.text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="country"
          render={({ field: { value, onChange } }) => (
            <FormItem>
              <FormLabel>{t('common:country')}</FormLabel>
              <FormControl>
                <Select onValueChange={onChange} value={value || ''}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a country" />
                  </SelectTrigger>
                  <SelectContent className="h-[300px]">
                    {countries.map((country) => (
                      <SelectItem key={country.code} value={country.name}>
                        <CountryFlag countryCode={country.code} imgType="png" className="mr-2" />
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="submit" disabled={!form.formState.isDirty} loading={isPending || apiPending}>
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
