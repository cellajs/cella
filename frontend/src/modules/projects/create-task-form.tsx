import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { Button } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';
import { useUserStore } from '~/store/user';
import { dialog } from '../common/dialoger/state';
import InputFormField from '../common/form-fields/input';
import { useElectric, type Project } from '../common/root/electric';

interface CreateTaskFormProps {
  project: Project;
  dialog?: boolean;
}

const formSchema = z.object({
  summary: z.string().nonempty('common:validation.required'),
});

type FormValues = z.infer<typeof formSchema>;

const CreateTaskForm: React.FC<CreateTaskFormProps> = ({ project, dialog: isDialog }) => {
  const user = useUserStore((state) => state.user);
  const { t } = useTranslation();

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const { db } = useElectric()!;

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        summary: '',
      },
    }),
    [],
  );

  const form = useFormWithDraft<FormValues>('create-organization', formOptions);

  const [isPending, setIsPending] = useState(false);

  const onSubmit = (values: FormValues) => {
    try {
      setIsPending(true);

      db.tasks
        .create({
          data: {
            id: window.crypto.randomUUID(),
            summary: values.summary,
            project_id: project.id,
            created_at: new Date(),
            created_by: user.id,
            // TODO: Add status
            status: 1,
            // TODO: Add slug
            slug: values.summary.toLowerCase().replace(/ /g, '-'),
            // TODO: Add type
            type: 'feature'
          },
        })
        .then((result) => {
          console.log('result', result);
          form.reset();

          toast.success(t('common:success.create_organization'));

          if (isDialog) {
            dialog.remove();
          }
        });
    } finally {
      setIsPending(false);
    }
  };

  const cancel = () => {
    form.reset();
    if (isDialog) dialog.remove();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <InputFormField control={form.control} name="summary" label={t('common:summary')} required />
        {/* <SlugFormField
          control={form.control}
          type=""
          label={t('common:project_handle')}
          description={t('common:project_handle.text')}
          nameValue={name}
        /> */}
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

export default CreateTaskForm;
