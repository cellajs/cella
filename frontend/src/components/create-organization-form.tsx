import { zodResolver } from '@hookform/resolvers/zod';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

// Change this in the future on current schema
import { createOrganizationJsonSchema } from 'backend/schemas/organizations';
import { createOrganization } from '~/api/api';

import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/components/ui/form';
import { Input } from '~/components/ui/input';
import { useApiWrapper } from '~/hooks/useApiWrapper';
import useFormWithDraft from '~/hooks/useDraftForm';
import { useNavigationStore } from '~/store/navigation';
import { Organization } from '~/types';
import { dialog } from './dialoger/state';

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

        toast.success(
          t('success.create_organization', {
            defaultValue: 'Organization created',
          }),
        );

        if (!callback) {
          setSheet(null);
          navigate({
            to: '/$organizationIdentifier/members',
            params: {
              organizationIdentifier: result.slug,
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
        <div className="flex space-x-2">
          <Button type="submit" disabled={!form.formState.isDirty} loading={pending}>
            {t('action.create', {
              defaultValue: 'Create',
            })}
          </Button>
          {form.formState.isDirty && (
            <Button variant="secondary" aria-label="Cancel" onClick={cancel}>
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

export default CreateOrganizationForm;
