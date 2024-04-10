import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { type UseFormProps, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

// Change this in the future on current schema
import { createOrganizationJsonSchema } from 'backend/modules/organizations/schema';
import { createOrganization } from '~/api/organizations';

import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { checkSlugAvailable } from '~/api/general';
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
  withButtons?: boolean;
  initValues?: FormValues | null;
  onValuesChange?: (values: FormValues | null) => void;
}

const formSchema = createOrganizationJsonSchema;

type FormValues = z.infer<typeof formSchema>;

const CreateOrganizationForm: React.FC<CreateOrganizationFormProps> = ({
  callback,
  dialog: isDialog,
  initValues,
  onValuesChange,
  withButtons = true,
  withDraft = true,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setSheet } = useNavigationStore();

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        name: '',
      },
    }),
    [],
  );

  const form = withDraft ? useFormWithDraft<FormValues>('create-organization', formOptions) : useForm<FormValues>(formOptions);

  const allFields = useWatch({ control: form.control });

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

  const { mutate: checkSlug, isPending: isCheckPending } = useMutation({
    mutationFn: checkSlugAvailable,
    onSuccess: (isAvailable) => {
      if (!isAvailable) {
        form.setError('slug', {
          type: 'manual',
          message: t('common:error.slug_exists'),
        });
      } else {
        form.clearErrors('slug');
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

  // Set initial values
  useEffect(() => {
    if (initValues) {
      for (const [key, value] of Object.entries(initValues)) {
        form.setValue(key as keyof FormValues, value, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    }
  }, []);

  useEffect(() => {
    onValuesChange?.(form.formState.isDirty ? (allFields as FormValues) : null);
  }, [onValuesChange, allFields]);

  const slug = useWatch({
    control: form.control,
    name: 'slug',
  });

  useEffect(() => {
    if (slug) {
      checkSlug(slug);
    }
  }, [slug]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <InputFormField control={form.control} name="name" label={t('common:name')} required />
        <InputFormField
          control={form.control}
          name="slug"
          label={t('common:organization_handle')}
          description={t('common:organization_handle.text')}
          required
        />
        {withButtons && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="submit" disabled={!form.formState.isDirty} loading={isPending || isCheckPending}>
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
