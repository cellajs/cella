import { zodResolver } from '@hookform/resolvers/zod';
import { updateOrganizationJsonSchema } from 'backend/schemas/organizations';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import CountryFlag from '~/components/country-flag';
import { Organization } from '~/types';

import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/components/ui/form';
import { Input } from '~/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { useApiWrapper } from '~/hooks/useApiWrapper';
import useFormWithDraft from '~/hooks/useDraftForm';
import countries from '~/lib/countries.json';
import timezones from '~/lib/timezones.json';
import { useUpdateOrganizationMutation } from '~/router/routeTree';
import { dialog } from './dialoger/state';

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
      name: organization.name,
      timezone: organization.timezone,
      country: organization.country,
    },
  });

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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
