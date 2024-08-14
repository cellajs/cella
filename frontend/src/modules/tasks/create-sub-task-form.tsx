import { zodResolver } from '@hookform/resolvers/zod';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { Plus } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { nanoid } from '~/lib/utils.ts';
import { Button } from '~/modules/ui/button';
import { useThemeStore } from '~/store/theme.ts';
import { useUserStore } from '~/store/user.ts';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { getNewTaskOrder } from './helpers.ts';
import { CreateTaskBlockNote } from '~/modules/common/blocknotes/create-task-blocknote.tsx';
import { createTask } from '~/api/tasks.ts';
import type { Task } from '~/types';
import { dispatchCustomEvent } from '~/lib/custom-events.ts';
import { useLocation } from '@tanstack/react-router';

const formSchema = z.object({
  id: z.string(),
  summary: z.string(),
  description: z.string(),
  type: z.string(),
  impact: z.number().nullable(),
  status: z.number(),
  parentId: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

export const CreateSubTaskForm = ({
  parentTask,
  formOpen,
  setFormState,
}: {
  parentTask: Task;
  formOpen: boolean;
  setFormState: (value: boolean) => void;
}) => {
  const { t } = useTranslation();
  const { mode } = useThemeStore();
  const { pathname } = useLocation();
  const { user } = useUserStore(({ user }) => ({ user }));

  const handleHotKeysKeyPress = useCallback(() => {
    setFormState(false);
  }, [setFormState]);

  useHotkeys([['Escape', handleHotKeysKeyPress]]);

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        id: '',
        description: '',
        summary: '',
        type: 'chore',
        impact: null,
        status: 1,
        parentId: parentTask.id,
      },
    }),
    [],
  );

  // Form with draft in local storage
  const form = useFormWithDraft<FormValues>(`create-sub-task-${parentTask.id}`, formOptions);

  const onSubmit = (values: FormValues) => {
    const subTaskId = nanoid();
    // Extract text from summary HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(values.summary, 'text/html');
    const summaryText = doc.body.textContent || `subtask${subTaskId}`;

    const slug = summaryText.toLowerCase().replace(/ /g, '-');

    const newSubTask = {
      id: subTaskId,
      description: values.description,
      summary: values.summary,
      type: 'chore' as const,
      impact: null,
      status: 1,
      parentId: parentTask.id,
      organizationId: parentTask.organizationId,
      assignedTo: [],
      labels: [],
      projectId: parentTask.projectId,
      createdBy: user.id,
      slug: slug,
      order: getNewTaskOrder(values.status, parentTask.subTasks),
    };

    createTask(newSubTask).then((resp) => {
      if (resp) {
        form.reset();
        toast.success(t('common:success.create_resource', { resource: t('common:task') }));
        if (pathname.includes('/board')) dispatchCustomEvent('taskCRUD', { array: [newSubTask], action: 'createSubTask' });
        dispatchCustomEvent('taskTableCRUD', { array: [newSubTask], action: 'createSubTask' });
        setFormState(false);
      }
    });
  };

  // default value in blocknote <p class="bn-inline-content"></p so check by removing it
  const isDirty = () => {
    const fields = form.getValues('description').replace('<p class="bn-inline-content"></p>', '');
    return !!fields.length;
  };

  if (!formOpen)
    return (
      <Button variant="secondary" size="sm" className="w-full mb-1 rounded-none opacity-50 hover:opacity-100" onClick={() => setFormState(true)}>
        <Plus size={16} />
        <span className="ml-1 font-normal">{t('common:add_subtask')}</span>
      </Button>
    );
  return (
    <Form {...form}>
      <form id="create-sub-task" onSubmit={form.handleSubmit(onSubmit)} className="p-3 flex gap-2 flex-col bg-secondary">
        <FormField
          control={form.control}
          name="description"
          render={({ field: { value, onChange } }) => {
            return (
              <FormItem>
                <FormControl>
                  <CreateTaskBlockNote
                    projectId={parentTask.projectId}
                    value={value || ''}
                    onChange={(description, summary) => {
                      onChange(description);
                      form.setValue('summary', summary);
                    }}
                    mode={mode}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
        <div className="inline-flex justify-between">
          <div className="inline-flex gap-2">
            <Button size={'xs'} type="submit" disabled={!isDirty()}>
              <span>{t('common:create')}</span>
            </Button>
            <Button
              size={'xs'}
              type="reset"
              variant="secondary"
              className={isDirty() ? '' : 'hidden'}
              aria-label="Cancel"
              onClick={() => form.reset()}
            >
              {t('common:cancel')}
            </Button>
            <Button
              size={'xs'}
              type="button"
              variant="secondary"
              aria-label="close"
              onClick={() => setFormState(false)}
              className={isDirty() ? 'hidden' : ''}
            >
              {t('common:close')}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
};

export default CreateSubTaskForm;
