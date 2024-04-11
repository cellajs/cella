import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { type UseFormProps, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import slugify from 'slugify';

// Change this in the future on current schema
import { createOrganizationJsonSchema } from 'backend/modules/organizations/schema';
import { createOrganization } from '~/api/organizations';

import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { checkSlugAvailable } from '~/api/general';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { Button } from '~/modules/ui/button';
import { Form, type LabelDirectionType } from '~/modules/ui/form';
import { useNavigationStore } from '~/store/navigation';
import type { Organization } from '~/types';
import InputFormField from '../common/form-fields/input';
import { dialog } from '../common/dialoger/state';
import { useStepper } from '../ui/stepper';

interface CreateOrganizationFormProps {
  callback?: (organization: Organization) => void;
  dialog?: boolean;
  labelDirection?: LabelDirectionType;
  children?: React.ReactNode;
}

const formSchema = createOrganizationJsonSchema;

type FormValues = z.infer<typeof formSchema>;

const CreateOrganizationForm: React.FC<CreateOrganizationFormProps> = ({ callback, dialog: isDialog, labelDirection = 'top', children }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setSheet } = useNavigationStore();
  const [isDeviating, setDeviating] = useState(false);
  const { nextStep } = useStepper();

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        name: '',
        slug: '',
      },
    }),
    [],
  );

  const form = useFormWithDraft<FormValues>('create-organization', formOptions);

  const { mutate: create, isPending } = useMutation({
    mutationFn: createOrganization,
    onSuccess: (result) => {
      form.reset();
      callback?.(result);
      toast.success(t('common:success.create_organization'));

      nextStep?.();

      if (!callback && !nextStep) {
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

  const name = useWatch({
    control: form.control,
    name: 'name',
  });

  useEffect(() => {
    if (isDeviating) return;
    form.setValue('slug', slugify(name, { lower: true }));
  }, [name]);

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
    <Form {...form} labelDirection={labelDirection}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <InputFormField control={form.control} name="name" label={t('common:name')} required />
        <InputFormField
          control={form.control}
          name="slug"
          onFocus={() => setDeviating(true)}
          label={t('common:organization_handle')}
          description={t('common:organization_handle.text')}
          required
        />
        {children}
        {!children && (
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
