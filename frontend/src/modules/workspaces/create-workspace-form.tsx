import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { type UseFormProps, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import slugify from 'slugify';
import type { z } from 'zod';

// Change this in the future on current schema
import { createWorkspaceJsonSchema } from 'backend/modules/workspaces/schema';
import { createWorkspace } from '~/api/workspaces';

// import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { Button } from '~/modules/ui/button';
import { Form, type LabelDirectionType } from '~/modules/ui/form';
import { useNavigationStore } from '~/store/navigation';
import type { Workspace } from '~/types';
import { dialog } from '../common/dialoger/state';
import InputFormField from '../common/form-fields/input';
import { useStepper } from '../ui/stepper';
import { SlugFormField } from '../common/form-fields/slug';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface CreateWorkspaceFormProps {
  callback?: (workspace: Workspace) => void;
  dialog?: boolean;
  labelDirection?: LabelDirectionType;
  children?: React.ReactNode;
}

const formSchema = createWorkspaceJsonSchema;

type FormValues = z.infer<typeof formSchema>;

const CreateWorkspaceForm: React.FC<CreateWorkspaceFormProps> = ({ callback, dialog: isDialog, labelDirection = 'top', children }) => {
  const { t } = useTranslation();
  const { setSheet } = useNavigationStore();
  const [isDeviating, setDeviating] = useState(false);
  const [selectedOrganization, setSelectedOrganization] = useState('');
  const { nextStep } = useStepper();
  const { menu } = useNavigationStore();
  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        name: '',
        slug: '',
        organizationId: '',
      },
    }),
    [],
  );

  const form = useFormWithDraft<FormValues>('create-workspace', formOptions);

  const { mutate: create, isPending } = useMutation({
    mutationFn: createWorkspace,
    onSuccess: (result) => {
      form.reset();
      callback?.(result);
      toast.success(t('common:success.create_workspace'));

      nextStep?.();

      if (!callback && !nextStep) {
        setSheet(null);
        // navigate({
        //   to: '/$organizationIdentifier/members',
        //   params: {
        //     organizationIdentifier: result.slug,
        //   },
        // });
      }

      if (isDialog) dialog.remove();
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

  const handleOrganizationSelect = (organizationId: string) => {
    setSelectedOrganization(organizationId);
    form.setValue('organizationId', organizationId);
  };

  useEffect(() => {
    if (isDeviating) return;
    form.setValue('slug', slugify(name, { lower: true }));
  }, [name]);

  return (
    <Form {...form} labelDirection={labelDirection}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Select onValueChange={handleOrganizationSelect} value={selectedOrganization}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={'Select organization'} />
          </SelectTrigger>
          <SelectContent className="h-[30vh]">
              {menu.organizations.items.map((organization) => (
                <SelectItem
                  onClick={() => handleOrganizationSelect(organization.id)}
                  className="cursor-pointer"
                  key={organization.id}
                  value={organization.id}
                >
                  {organization.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <InputFormField control={form.control} name="name" label={t('common:name')} required />
        <SlugFormField
          control={form.control}
          name="slug"
          onFocus={() => setDeviating(true)}
          label={t('common:workspace_handle')}
          required
          description={t('common:workspace_handle.text')}
          errorMessage={t('common:error.slug_exists')}
        />
        {children}
        {!children && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="submit" disabled={!form.formState.isDirty || selectedOrganization === ''} loading={isPending}>
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

export default CreateWorkspaceForm;
