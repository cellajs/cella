import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type React from 'react';
import { useForm, type UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useCallback, useContext, useMemo } from 'react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { Button } from '~/modules/ui/button';
import { dialog } from '../common/dialoger/state.ts';
import { Form, FormField, FormItem, FormControl, FormMessage } from '../ui/form.tsx';
import { createWorkspace } from '~/api/workspaces';
import { SelectImpact } from './select-impact.tsx';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group.tsx';
import { Bolt, Bug, Star } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import { useThemeStore } from '~/store/theme.ts';
import type { Task, TaskUser } from '~/mocks/dataGeneration.ts';
import AssignMembers from './select-members.tsx';
import SetLabels from './select-labels.tsx';
import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { WorkspaceContext } from '../workspaces/index.tsx';
import { ProjectContext } from './board.tsx';

export type TaskType = 'feature' | 'bug' | 'chore';
export type TaskStatus = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type TaskImpact = 0 | 1 | 2 | 3 | null;

interface CreateTaskFormProps {
  dialog?: boolean;
  onCloseForm?: () => void;
}

const formSchema = z.object({
  id: z.string(),
  markdown: z.string(),
  type: z.string(),
  impact: z.number().nullable(),
  assignedTo: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      thumbnailUrl: z.number().nullable(),
      bio: z.string(),
    }),
  ),
  labels: z.array(
    z.object({
      id: z.string(),
      value: z.string(),
      color: z.string(),
    }),
  ),
  status: z.number(),
});

type FormValues = z.infer<typeof formSchema>;

const CreateTaskForm: React.FC<CreateTaskFormProps> = ({ dialog: isDialog, onCloseForm }) => {
  const { t } = useTranslation();
  const { mode } = useThemeStore();
  const { register } = useForm<FormValues>();

  const { updateTasks } = useContext(WorkspaceContext);
  const { project } = useContext(ProjectContext);

  const handleCloseForm = () => {
    if (isDialog) dialog.remove();
    onCloseForm?.();
  };

  const handleMDEscKeyPress: React.KeyboardEventHandler<HTMLDivElement> = useCallback((event) => {
    if (event.key !== 'Escape') return;
    handleCloseForm();
  }, []);

  const handleHotKeysEscKeyPress = useCallback(() => {
    handleCloseForm();
  }, []);

  useHotkeys([['Escape', handleHotKeysEscKeyPress]]);

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        id: 'gfdgdfgsf43t54',
        markdown: '',
        type: 'feature',
        impact: null,
        assignedTo: [],
        labels: [],
        status: 1,
      },
    }),
    [],
  );

  // Form with draft in local storage
  const form = useFormWithDraft<FormValues>('create-task', formOptions);

  const { isPending } = useMutation({
    // mutate: create
    mutationFn: createWorkspace, // change to create task
    onSuccess: () => {
      // form.reset();
      handleCloseForm();
    },
  });

  type PartialTask = Partial<Task>;

  const onSubmit = (values: FormValues) => {
    const task: PartialTask = {
      id: values.id,
      markdown: values.markdown,
      type: values.type as TaskType,
      impact: values.impact as TaskImpact,
      assignedTo: values.assignedTo as TaskUser[],
      labels: values.labels,
      status: 1,
      projectId: project.id,
    };
    updateTasks(task as Task);
    form.reset();
    toast.success(t('common:success.create_task'));
    onCloseForm?.();
  };
  // Fix types
  return (
    <Form {...form}>
      <form id="create-task" onSubmit={form.handleSubmit(onSubmit)} className="p-4 border-b flex gap-2 flex-col shadow-inner">
        <FormField
          control={form.control}
          name="type"
          render={({ field: { value, onChange } }) => {
            return (
              <FormItem>
                <FormControl>
                  <ToggleGroup
                    {...register('type')}
                    type="single"
                    variant="merged"
                    className="gap-0 w-full"
                    value={value}
                    onValueChange={(value) => {
                      onChange(value);
                    }}
                  >
                    <ToggleGroupItem size="sm" value="feature" className="w-full">
                      <Star size={16} className={`${value === 'feature' && 'fill-amber-400 text-amber-500'}`} />
                      <span className="ml-2 font-light">{t('common:feature')}</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem size="sm" value="bug" className="w-full">
                      <Bug size={16} className={`${value === 'bug' && 'fill-red-400 text-red-500'}`} />
                      <span className="ml-2 font-light">{t('common:bug')}</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem size="sm" value="chore" className="w-full">
                      <Bolt size={16} className={`${value === 'chore' && 'fill-slate-400 text-slate-500'}`} />
                      <span className="ml-2 font-light">{t('common:chore')}</span>
                    </ToggleGroupItem>
                  </ToggleGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <FormField
          control={form.control}
          name="markdown"
          render={({ field: { value, onChange } }) => {
            return (
              <FormItem>
                <FormControl>
                  <MDEditor
                    {...register('markdown')}
                    onKeyDown={handleMDEscKeyPress}
                    value={value}
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
                    className="border text-sm"
                    style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C', background: 'transparent', padding: '0.5rem' }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        {form.getValues('type') !== 'bug' && (
          <FormField
            control={form.control}
            name="impact"
            render={({ field: { onChange } }) => {
              return (
                <FormItem>
                  <FormControl>
                    <SelectImpact {...register('impact')} mode="create" changeTaskImpact={onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        )}

        <FormField
          control={form.control}
          name="assignedTo"
          render={({ field: { onChange } }) => {
            return (
              <FormItem>
                <FormControl>
                  <AssignMembers {...register('assignedTo')} mode="create" changeAssignedTo={onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <FormField
          control={form.control}
          name="labels"
          render={({ field: { onChange } }) => {
            return (
              <FormItem>
                <FormControl>
                  <SetLabels {...register('labels')} mode="create" changeLabels={onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <div className="flex flex-col sm:flex-row gap-2">
          <Button size={'xs'} type="submit" disabled={!form.formState.isDirty} loading={isPending}>
            {t('common:create')}
          </Button>
          <Button
            size={'xs'}
            type="reset"
            variant="secondary"
            className={form.formState.isDirty ? '' : 'invisible'}
            aria-label="Cancel"
            onClick={() => form.reset()}
          >
            {t('common:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default CreateTaskForm;
