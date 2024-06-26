import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { Plus } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { nanoid } from '~/lib/utils.ts';
import { Button } from '~/modules/ui/button';
import { useThemeStore } from '~/store/theme.ts';
import { useUserStore } from '~/store/user.ts';
import { useElectric } from '~/modules/common/electric/electrify.ts';
import { Form, FormControl, FormField, FormItem, FormMessage } from '../../ui/form.tsx';
import { useProjectContext } from '../board/project-context.tsx';

const formSchema = z.object({
  id: z.string(),
  summary: z.string(),
  markdown: z.string(),
  type: z.string(),
  impact: z.number().nullable(),
  parent_id: z.string(),
  status: z.number(),
});

type FormValues = z.infer<typeof formSchema>;

export const CreateSubTaskForm = ({
  parentTaskId,
  formOpen,
  setFormState,
  firstSubTask,
}: { parentTaskId: string; firstSubTask: boolean; formOpen: boolean; setFormState: (value: boolean) => void }) => {
  const { t } = useTranslation();
  const { mode } = useThemeStore();
  const { user } = useUserStore(({ user }) => ({ user }));

  const Electric = useElectric();

  const { project, tasks } = useProjectContext(({ project, tasks, labels }) => ({ project, tasks, labels }));

  const handleMDEscKeyPress: React.KeyboardEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      if (event.key !== 'Escape') return;
      setFormState(false);
    },
    [setFormState],
  );

  const handleHotKeysKeyPress = useCallback(() => {
    setFormState(false);
  }, [setFormState]);

  useHotkeys([['Escape', handleHotKeysKeyPress]]);

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        id: '',
        markdown: '',
        summary: '',
        parent_id: parentTaskId,
        type: 'chore',
        impact: null,
        status: 1,
      },
    }),
    [],
  );

  // Form with draft in local storage
  const form = useFormWithDraft<FormValues>(`create-sub-task-${parentTaskId}`, formOptions);

  const onSubmit = (values: FormValues) => {
    if (!Electric) return toast.error(t('common:local_db_inoperable'));
    // create(values);
    const summary = values.markdown.split('\n')[0];
    const slug = summary.toLowerCase().replace(/ /g, '-');
    const projectTasks = tasks.filter((task) => task.project_id === project.id);
    const order = projectTasks.length > 0 ? projectTasks[0].sort_order / 1.1 : 1;

    Electric.db.tasks
      .create({
        data: {
          id: nanoid(),
          markdown: values.markdown,
          summary: summary,
          type: 'chore',
          impact: null,
          status: 1,
          parent_id: parentTaskId,
          organization_id: project.organizationId,
          assigned_to: [],
          labels: [],
          project_id: project.id,
          created_at: new Date(),
          created_by: user.id,
          slug: slug,
          sort_order: order,
        },
      })
      .then(() => {
        form.reset();
        toast.success(t('common:success.create_resource', { resource: t('common:task') }));
        setFormState(false);
      });
  };
  if (!formOpen)
    return (
      <Button className="w-full rounded-none bg-secondary" onClick={() => setFormState(true)}>
        <Plus size={16} />
        <span className="ml-1">{firstSubTask ? t('common:create_new_sub_task') : t('common:create_another_sub_task')}</span>
      </Button>
    );
  // Fix types
  return (
    <Form {...form}>
      <form id="create-sub-task" onSubmit={form.handleSubmit(onSubmit)} className="p-3 flex gap-2 flex-col bg-secondary">
        <FormField
          control={form.control}
          name="markdown"
          render={({ field: { value, onChange } }) => {
            return (
              <FormItem>
                <FormControl>
                  <MDEditor
                    onKeyDown={handleMDEscKeyPress}
                    value={value}
                    textareaProps={{ placeholder: t('common:placeholder.sub_mdEditor') }}
                    defaultTabEnable={true}
                    preview={'edit'}
                    onChange={(newValue) => {
                      if (typeof newValue === 'string') onChange(newValue);
                    }}
                    autoFocus={true}
                    hideToolbar={true}
                    visibleDragbar={false}
                    height={'auto'}
                    minHeight={40}
                    className="text-sm my-1"
                    style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C', background: 'transparent', padding: '0' }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
        <div className="inline-flex justify-between">
          <div className="inline-flex gap-2">
            <Button size={'xs'} type="submit" disabled={!form.formState.isDirty}>
              <span>{t('common:create')}</span>
            </Button>
            <Button
              size={'xs'}
              type="reset"
              variant="secondary"
              className={form.formState.isDirty ? '' : 'hidden'}
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
              className={form.formState.isDirty ? 'hidden' : ''}
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
