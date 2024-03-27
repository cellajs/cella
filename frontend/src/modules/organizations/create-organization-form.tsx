import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import type { Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

// Change this in the future on current schema
import { createOrganizationJsonSchema } from 'backend/modules/organizations/schema';
import { createOrganization } from '~/api/organizations';

import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { Button } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';
import { useNavigationStore } from '~/store/navigation';
import type { Organization } from '~/types';
import { dialog } from '../common/dialoger/state';
import InputFormField from '../common/forms/input';
import { useMutation } from '~/hooks/use-mutations';

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

  const form = useFormWithDraft<FormValues>('create-organization', {
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
    },
  });

  const { mutate: create, isPending } = useMutation({
    mutationFn: createOrganization,
    onSuccess: (result) => {
      form.reset();
      callback?.(result);

      toast.success(t('common:success.create_organization'));

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
  });

  const onSubmit = (values: FormValues) => {
    create(values.name);
  };

  const cancel = () => {
    form.reset();
    if (isDialog) dialog.remove();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* TODO: fix this typescript issue */}
        <InputFormField control={form.control as unknown as Control} name="name" label={t('common:name')} required />
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="submit" disabled={!form.formState.isDirty} loading={isPending}>
            {t('common:create')}
          </Button>
          <Button type="reset" variant="secondary" className={form.formState.isDirty ? '' : 'sm:invisible'} aria-label="Cancel" onClick={cancel}>
            {t('common:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default CreateOrganizationForm;
