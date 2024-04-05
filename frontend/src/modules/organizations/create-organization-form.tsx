import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { type Control, type UseFormReturn, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

// Change this in the future on current schema
import { createOrganizationJsonSchema } from 'backend/modules/organizations/schema';
import { createOrganization } from '~/api/organizations';

import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { Button } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';
import { useNavigationStore } from '~/store/navigation';
import type { Organization } from '~/types';
import { dialog } from '../common/dialoger/state';
import InputFormField from '../common/form-fields/input';

interface CreateOrganizationFormProps {
  callback?: (organization: Organization) => void;
  dialog?: boolean;
  withDraft?: boolean;
  setForm?: (form: UseFormReturn<FormValues>) => void;
  withButtons?: boolean;
}

const formSchema = createOrganizationJsonSchema;

type FormValues = z.infer<typeof formSchema>;

const formOptions = {
  resolver: zodResolver(formSchema),
  defaultValues: {
    name: '',
  },
};

const CreateOrganizationForm: React.FC<CreateOrganizationFormProps> = ({
  callback,
  dialog: isDialog,
  setForm,
  withButtons = true,
  withDraft = true,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setSheet } = useNavigationStore();

  const form = withDraft ? useFormWithDraft<FormValues>('create-organization', formOptions) : useForm<FormValues>(formOptions);

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
    create(values);
  };

  const cancel = () => {
    form.reset();
    if (isDialog) dialog.remove();
  };

  const allFields = form.watch();

  useEffect(() => {
    if (setForm) {
      setForm(form);
    }
  }, [setForm, allFields]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* TODO: fix this typescript issue */}
        <InputFormField control={form.control as unknown as Control} name="name" label={t('common:name')} required />
        {withButtons && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="submit" disabled={!form.formState.isDirty} loading={isPending}>
              {t('common:create')}
            </Button>
            <Button type="reset" variant="secondary" className={form.formState.isDirty ? '' : 'sm:invisible'} aria-label="Cancel" onClick={cancel}>
              {t('common:cancel')}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
};

export default CreateOrganizationForm;
