import { zodResolver } from '@hookform/resolvers/zod';
import { updateOrganizationJsonSchema } from 'backend/schemas/organizations';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import CountryFlag from '~/components/country-flag';
import { Organization } from '~/types';

import { config } from 'config';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/components/ui/form';
import { Input } from '~/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { useApiWrapper } from '~/hooks/useApiWrapper';
import useBeforeUnload from '~/hooks/useBeforeUnload';
import useFormWithDraft from '~/hooks/useDraftForm';
import countries from '~/lib/countries.json';
import timezones from '~/lib/timezones.json';
import { useUpdateOrganizationMutation } from '~/router/routeTree';
import { dialog } from './dialoger/state';
import MultipleSelector, { Option } from './ui/multiple-selector';
import { useWatch } from 'react-hook-form';
import { checkSlug } from '~/api/general';
import { Undo } from 'lucide-react';

interface Props {
  organization: Organization;
  callback?: (organization: Organization) => void;
  dialog?: boolean;
}

const formSchema = updateOrganizationJsonSchema;

type FormValues = z.infer<typeof formSchema>;

const UpdateOrganizationForm = ({ organization, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();
  const [apiWrapper, pending] = useApiWrapper();
  const updateOrganizationMutation = useUpdateOrganizationMutation(organization.id);

  const form = useFormWithDraft<FormValues>(`update-organization-${organization.id}`, {
    resolver: zodResolver(formSchema),
    defaultValues: {
      slug: organization.slug,
      name: organization.name,
      shortName: organization.shortName,
      websiteUrl: organization.websiteUrl,
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
    apiWrapper(
      () => updateOrganizationMutation.mutateAsync(values),
      (result) => {
        form.reset(values);
        callback?.(result);

        if (isDialog) {
          dialog.remove();
        }

        toast.success(
          t('success.update_organization', {
            defaultValue: 'Organization updated',
          }),
        );
      },
    );
  };

  const cancel = () => {
    form.reset();
    isDialog && dialog.remove();
  };

  const initLanguages = config.languages.filter((language) => organization.languages?.includes(language.value)) || [];
  const [selectedLanguages, setSelectedLanguages] = useState(initLanguages);

  // TODO: the multiple selector should be able to an array of values too, not just an array of objects
  const selectedLanguagesChange = (value: Option[]) => {
    setSelectedLanguages(value);
    const updatedLanguages = value.map((language) => language.value);
    form.setValue('languages', updatedLanguages, { shouldDirty: true, shouldValidate: true });
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
              message: t('error.slug_already_exists', {
                defaultValue: 'Slug already exists',
              }),
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
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t('label.organization_handle', {
                  defaultValue: 'Organization handle',
                })}
              </FormLabel>
              <FormDescription>A unique handle for organization URL.</FormDescription>
              <FormControl>
                {/* TODO: This breaks accessibility of the form label? */}
                <div className="relative">
                  <Input {...field} />
                  {organization.slug !== slug && (
                    <div className="absolute inset-y-1 right-1 flex justify-end">
                      <Button variant="ghost" size="sm" aria-label="Revert to current organization handle" onClick={revertSlug} className="h-full">
                        <Undo size={16} className="mr-2" /> Revert to <strong className="ml-1">{organization.slug}</strong>
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
              <FormLabel>
                {t('label.name', {
                  defaultValue: 'Name',
                })}
              </FormLabel>
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
              <FormLabel>
                {t('label.short_name', {
                  defaultValue: 'Short name',
                })}
              </FormLabel>
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
              <FormLabel>
                {t('label.notification_email', {
                  defaultValue: 'Notification email',
                })}
              </FormLabel>
              <FormDescription>Receive announcements and product updates through this email address.</FormDescription>
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
              <FormLabel>
                {t('label.website_url', {
                  defaultValue: 'Website url',
                })}
              </FormLabel>
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
          render={() => (
            <FormItem>
              <FormLabel>
                {t('label.languages', {
                  defaultValue: 'Languages',
                })}
              </FormLabel>
              <FormControl>
                <MultipleSelector
                  value={selectedLanguages}
                  onChange={selectedLanguagesChange}
                  defaultOptions={config.languages}
                  placeholder="Select ..."
                  emptyIndicator="No more languages"
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
              <FormLabel>
                {t('label.default_language', {
                  defaultValue: 'Default language',
                })}
              </FormLabel>
              <FormDescription>The language that will be given to new members.</FormDescription>
              <FormControl>
                <Select onValueChange={onChange} defaultValue={value ?? undefined}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a language" />
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
              <FormLabel>
                {t('label.timezone', {
                  defaultValue: 'Timezone',
                })}
              </FormLabel>
              <FormControl>
                <Select onValueChange={onChange} defaultValue={value ?? undefined}>
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
              <FormLabel>
                {t('label.country', {
                  defaultValue: 'Country',
                })}
              </FormLabel>
              <FormControl>
                <Select onValueChange={onChange} defaultValue={value ?? undefined}>
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
        <div className="flex space-x-2">
          <Button type="submit" disabled={!form.formState.isDirty} loading={pending}>
            {t('action.save_changes', {
              defaultValue: 'Save changes',
            })}
          </Button>
          {form.formState.isDirty && (
            <Button variant="secondary" onClick={cancel}>
              {t('action.cancel', {
                defaultValue: 'Cancel',
              })}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
};

export default UpdateOrganizationForm;
