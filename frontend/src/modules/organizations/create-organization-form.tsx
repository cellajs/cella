import { zodResolver } from '@hookform/resolvers/zod';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

// Change this in the future on current schema
import { createOrganizationJsonSchema } from 'backend/modules/organizations/schema';
import { createOrganization } from '~/api/organizations';

import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { useNavigationStore } from '~/store/navigation';
import { Organization } from '~/types';
import { dialog } from '../common/dialoger/state';

interface CreateOrganizationFormProps {
  callback?: (organization: Organization) => void;
  dialog?: boolean;
}

const formSchema = createOrganizationJsonSchema;

type FormValues = z.infer<typeof formSchema>;

const CreateOrganizationForm: React.FC<CreateOrganizationFormProps> = ({ callback, dialog: isDialog }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setSheet } = useNavigationStore();
  const [apiWrapper, pending] = useApiWrapper();

  const form = useFormWithDraft<FormValues>('create-organization', {
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
    },
  });

  const onSubmit = (values: FormValues) => {
    apiWrapper(
      () => createOrganization(values.name),
      (result) => {
        form.reset();
        callback?.(result);

        toast.success(t('success.create_organization'));

        if (!callback) {
          setSheet(null);
          navigate({
            to: '/$organizationIdentifier/$tab',
            params: {
              organizationIdentifier: result.slug,
              tab: 'members',
            },
          });
        }

        if (isDialog) {
          dialog.remove();
        }
      },
    );
  };

  const cancel = () => {
    form.reset();
    if (isDialog) dialog.remove();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('label.name')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="submit" disabled={!form.formState.isDirty} loading={pending}>
            {t('action.create')}
          </Button>
          <Button variant="secondary" className={form.formState.isDirty ? '' : 'sm:invisible'} aria-label="Cancel" onClick={cancel}>
            {t('action.cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default CreateOrganizationForm;
