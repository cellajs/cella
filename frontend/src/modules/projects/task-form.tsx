import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type React from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useCallback, useContext, useMemo } from 'react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { Button } from '~/modules/ui/button';
import { dialog } from '../common/dialoger/state.ts';
import { Form, FormField, FormItem, FormControl, FormMessage } from '../ui/form.tsx';
import { SelectImpact } from './select-impact.tsx';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group.tsx';
import { Bolt, Bug, Star } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import { useThemeStore } from '~/store/theme.ts';
import SetLabels from './select-labels.tsx';
import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { ProjectContext } from './board.tsx';
import { useElectric } from '../common/root/electric.ts';
import { Input } from '../ui/input.tsx';
import SelectStatus from './select-status.tsx';

export type TaskType = 'feature' | 'chore' | 'bug';
export type TaskStatus = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type TaskImpact = 0 | 1 | 2 | 3 | null;

interface CreateTaskFormProps {
  dialog?: boolean;
  onCloseForm?: () => void;
}

const formSchema = z.object({
  id: z.string(),
  summary: z.string(),
  markdown: z.string(),
  type: z.string(),
  impact: z.number().nullable(),
  // assignedTo: z.array(
  //   z.object({
  //     id: z.string(),
  //     name: z.string(),
  //     thumbnailUrl: z.number().nullable(),
  //     bio: z.string(),
  //   }),
  // ),
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

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const { db } = useElectric()!;

  const { project } = useContext(ProjectContext);

  const handleCloseForm = () => {
    if (isDialog) dialog.remove();
    onCloseForm?.();
  };

  const handleMDEscKeyPress: React.KeyboardEventHandler<HTMLDivElement> = useCallback((event) => {
    if (event.key !== 'Escape') return;
    handleCloseForm();
  }, []);

  const handleHotKeysKeyPress = useCallback(() => {
    handleCloseForm();
  }, []);

  useHotkeys([['Escape', handleHotKeysKeyPress]]);

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        id: window.crypto.randomUUID(),
        markdown: '',
        summary: '',
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

  const { isPending, mutate: create } = useMutation({
    // mutate: create
    mutationFn: (values: FormValues) => {
      return db.tasks.create({
        data: {
          id: values.id,
          markdown: values.markdown,
          summary: values.summary,
          type: values.type as TaskType,
          impact: values.impact as TaskImpact,
          // assignedTo: values.assignedTo as TaskUser[],
          // labels: values.labels,
          status: 1,
          project_id: project.id,
          created_at: new Date(),
          created_by: 'user.id',
          slug: values.summary.toLowerCase().replace(/ /g, '-'),
        },
      });
    },
    onSuccess: () => {
      form.reset();
      toast.success(t('common:success.create_task'));
      handleCloseForm();
    },
  });

  const onSubmit = (values: FormValues) => {
    create(values);

    db.tasks
      .create({
        data: {
          id: values.id,
          markdown: values.markdown,
          summary: values.summary,
          type: values.type as TaskType,
          impact: values.impact as TaskImpact,
          // assignedTo: values.assignedTo as TaskUser[],
          // labels: values.labels,
          status: 1,
          project_id: project.id,
          created_at: new Date(),
          created_by: 'user.id',
          slug: values.summary.toLowerCase().replace(/ /g, '-'),
        },
      })
      .then(() => {
        form.reset();
        toast.success(t('common:success.create_task'));
        handleCloseForm();
      });
  };
  // Fix types
  return (
    <Form {...form}>
      <form id="create-task" onSubmit={form.handleSubmit(onSubmit)} className="p-3 border-b flex gap-2 flex-col shadow-inner">
        <FormField
          control={form.control}
          name="summary"
          render={({ field: { value, onChange } }) => {
            return (
              <FormItem>
                <FormControl>
                  <Input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={t('common:summary')}
                    className="w-full text-sm"
                    required
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <FormField
          control={form.control}
          name="type"
          render={({ field: { value, onChange } }) => {
            return (
              <FormItem>
                <FormControl>
                  <ToggleGroup
                    type="single"
                    variant="merged"
                    className="gap-0 w-full"
                    value={value}
                    onValueChange={(value) => {
                      onChange(value);
                    }}
                  >
                    {['feature', 'chore', 'bug'].map((type) => (
                      <ToggleGroupItem size="sm" value={type} className="w-full" key={type}>
                        {type === 'feature' && <Star size={16} className="fill-amber-400 text-amber-500" />}
                        {type === 'chore' && <Bolt size={16} className="fill-slate-400 text-slate-500" />}
                        {type === 'bug' && <Bug size={16} className="fill-red-400 text-red-500" />}
                        <span className="ml-2 font-light">{t(`common:${type}`)}</span>
                      </ToggleGroupItem>
                    ))}
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
                    className="text-sm"
                    style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C', background: 'transparent', padding: '0' }}
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
                    <SelectImpact mode="create" changeTaskImpact={onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        )}

        {/* <FormField
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
        /> */}

        <FormField
          control={form.control}
          name="labels"
          render={({ field: { onChange } }) => {
            return (
              <FormItem>
                <FormControl>
                  <SetLabels projectId={project.id} mode="create" changeLabels={onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            size={'xs'}
            type="submit"
            disabled={!form.formState.isDirty}
            loading={isPending}
            className={`${form.formState.isDirty ? 'rounded-none rounded-l' : 'rounded'}`}
          >
            {t('common:create')}
          </Button>
          {form.formState.isDirty && (
            <FormField
              control={form.control}
              name="status"
              render={({ field: { onChange } }) => {
                return (
                  <FormItem>
                    <FormControl>
                      <SelectStatus
                        taskStatus={1}
                        changeTaskStatus={(newStatus) => {
                          onChange(newStatus);
                          onSubmit(form.getValues());
                        }}
                        mode="create"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          )}

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
