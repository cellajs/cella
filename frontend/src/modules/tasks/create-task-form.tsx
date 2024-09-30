import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { ChevronDown, Tag, UserX, X } from 'lucide-react';
import { type LegacyRef, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { createTask } from '~/api/tasks.ts';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { useMeasure } from '~/hooks/use-measure';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { dialog } from '~/modules/common/dialoger/state.ts';
import { dropdowner } from '~/modules/common/dropdowner/state.ts';
import { extractUniqueWordsFromHTML, getNewTaskOrder, taskExpandable } from '~/modules/tasks/helpers';
import { NotSelected } from '~/modules/tasks/task-selectors/impact-icons/not-selected';
import SelectImpact, { impacts } from '~/modules/tasks/task-selectors/select-impact';
import SetLabels from '~/modules/tasks/task-selectors/select-labels';
import AssignMembers from '~/modules/tasks/task-selectors/select-members';
import SelectStatus, { type TaskStatus, taskStatuses } from '~/modules/tasks/task-selectors/select-status';
import { taskTypes } from '~/modules/tasks/task-selectors/select-task-type';
import { TaskBlockNote } from '~/modules/tasks/task-selectors/task-blocknote';
import { AvatarGroup, AvatarGroupList, AvatarOverflowIndicator } from '~/modules/ui/avatar';
import { Badge } from '~/modules/ui/badge';
import { Button, buttonVariants } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';
import { useThemeStore } from '~/store/theme.ts';
import { useUserStore } from '~/store/user.ts';
import { useWorkspaceStore } from '~/store/workspace';
import type { Label, Task } from '~/types/app';
import type { Member } from '~/types/common';
import { cn, nanoid } from '~/utils/utils';

export type TaskType = 'feature' | 'chore' | 'bug';
export type TaskImpact = 0 | 1 | 2 | 3 | null;

interface CreateTaskFormProps {
  tasks: Task[];
  labels: Label[];
  projectId: string;
  organizationId: string;
  dialog?: boolean;
  onCloseForm?: () => void;
  onFormSubmit?: (task: Task, isNew?: boolean, toStatus?: TaskStatus) => void;
}

const formSchema = z.object({
  id: z.string(),
  summary: z.string(),
  description: z.string(),
  type: z.string(),
  impact: z.number().nullable(),
  assignedTo: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      thumbnailUrl: z.string().nullable(),
      bio: z.string().nullable(),
    }),
  ),
  labels: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      color: z.string().nullable(),
      projectId: z.string(),
      organizationId: z.string(),
      useCount: z.number(),
      lastUsed: z.string(),
    }),
  ),
  status: z.number(),
});

type FormValues = z.infer<typeof formSchema>;

const CreateTaskForm: React.FC<CreateTaskFormProps> = ({ tasks, projectId, organizationId, dialog: isDialog, onCloseForm }) => {
  const { t } = useTranslation();
  const { mode } = useThemeStore();
  const { user } = useUserStore();
  const { focusedTaskId } = useWorkspaceStore();

  const defaultId = nanoid();
  const { ref, bounds } = useMeasure();

  const handleCloseForm = () => {
    if (isDialog) dialog.remove();
    onCloseForm?.();
  };

  const handleHotKeysKeyPress = useCallback(() => {
    handleCloseForm();
  }, [handleCloseForm]);

  useHotkeys([['Escape', handleHotKeysKeyPress]]);
  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        id: defaultId,
        description: '',
        summary: '',
        type: 'feature',
        impact: null,
        assignedTo: [],
        labels: [],
        status: 1,
        expandable: false,
        keywords: '',
      },
    }),
    [],
  );

  // Form with draft in local storage
  const form = useFormWithDraft<FormValues>(`create-task-${projectId}`, formOptions);

  const onSubmit = (values: FormValues) => {
    const projectTasks = tasks.filter((task) => task.projectId === projectId);
    // Extract text from summary HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(values.summary, 'text/html');
    const summaryText = doc.body.textContent || `subtask${values.id}`;

    const slug = summaryText.toLowerCase().replace(/ /g, '-');

    const newTask = {
      id: values.id,
      description: values.description,
      summary: values.summary,
      expandable: taskExpandable(values.summary, values.description),
      keywords: extractUniqueWordsFromHTML(values.description),
      type: values.type as TaskType,
      impact: values.impact as TaskImpact,
      labels: values.labels.map((label) => label.id),
      assignedTo: values.assignedTo.map((user) => user.id),
      status: values.status,
      organizationId: organizationId,
      projectId: projectId,
      createdBy: user.id,
      slug: slug,
      order: getNewTaskOrder(values.status, projectTasks),
    };

    createTask(newTask)
      .then((resp) => {
        if (!resp) toast.error(t('common:error.create_resource', { resource: t('app:task') }));
        form.reset();
        toast.success(t('common:success.create_resource', { resource: t('app:task') }));
        handleCloseForm();
        dispatchCustomEvent('taskOperation', {
          array: [resp],
          action: 'create',
          projectId: projectId,
        });
      })
      .catch(() => toast.error(t('common:error.create_resource', { resource: t('app:task') })));
  };

  // default value in blocknote <p class="bn-inline-content"></p> so check if there it's only one
  const isDirty = () => {
    const type = form.getValues('type');
    const assignedTo = form.getValues('assignedTo');
    const status = form.getValues('status');
    const labels = form.getValues('labels');
    const impact = form.getValues('impact');
    if (assignedTo.length || labels.length || status !== 1 || impact || type !== 'feature') return true;
    const { dirtyFields } = form.formState;
    const fieldsKeys = Object.keys(dirtyFields);
    if (!fieldsKeys.length) return false;
    if (fieldsKeys.includes('description') && fieldsKeys.length === 1) {
      const description = form.getValues('description');
      const parser = new DOMParser();
      const doc = parser.parseFromString(description, 'text/html');
      const emptyPElements = Array.from(doc.querySelectorAll('p.bn-inline-content'));

      // Check if any <p> element has non-empty text content
      return emptyPElements.some((el) => el.textContent && el.textContent.trim() !== '');
    }
    return true;
  };

  return (
    <Form {...form}>
      <form
        ref={ref as LegacyRef<HTMLFormElement>}
        id="create-task"
        onSubmit={form.handleSubmit(onSubmit)}
        className="p-3 xs:pl-11 border-b flex gap-2 flex-col shadow-inner"
      >
        <FormField
          control={form.control}
          name="description"
          render={({ field: { value, onChange } }) => {
            return (
              <FormItem>
                <FormControl>
                  <TaskBlockNote
                    id={defaultId}
                    className="min-h-16 [&>.bn-editor]:min-h-16"
                    projectId={projectId}
                    html={value}
                    onChange={(description, summary) => {
                      onChange(description);
                      form.setValue('summary', summary);
                    }}
                    taskToClose={focusedTaskId}
                    callback={form.handleSubmit(onSubmit)}
                    mode={mode}
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
                    onValueChange={(newValue) => {
                      if (newValue.length > 0) onChange(newValue);
                    }}
                  >
                    {taskTypes.map((type) => (
                      <ToggleGroupItem size="sm" value={type.value} className="w-full" key={type.label}>
                        {type.icon()}
                        <span className="ml-2 font-light">{t(`app:${type.value}`)}</span>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
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
            render={({ field: { onChange, value } }) => {
              const selectedImpactValue = value as TaskImpact;
              const selectedImpact = selectedImpactValue !== null ? impacts[selectedImpactValue] : null;
              return (
                <FormItem>
                  <FormControl>
                    <Button
                      aria-label="Set impact"
                      variant="input"
                      size="sm"
                      className="relative font-light flex gap-2 justify-start"
                      type="button"
                      onClick={(event) => {
                        dropdowner(<SelectImpact value={selectedImpactValue} triggerWidth={bounds.width - 3} creationValueChange={onChange} />, {
                          id: `impact-${defaultId}`,
                          trigger: event.currentTarget,
                        });
                      }}
                    >
                      {selectedImpact !== null ? (
                        <>
                          <selectedImpact.icon className="size-4 fill-current" aria-hidden="true" />

                          {selectedImpact.label}
                        </>
                      ) : (
                        <>
                          <NotSelected className="size-4" aria-hidden="true" />
                          {t('app:set_impact')}
                        </>
                      )}
                    </Button>
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
          render={({ field: { onChange, value } }) => {
            return (
              <FormItem>
                <FormControl>
                  <Button
                    aria-label="Assign"
                    variant="input"
                    size="sm"
                    className="relative flex justify-start gap-2 font-light"
                    type="button"
                    onClick={(event) => {
                      dropdowner(
                        <AssignMembers
                          value={value as Member[]}
                          triggerWidth={bounds.width - 3}
                          projectId={projectId}
                          creationValueChange={onChange}
                        />,
                        {
                          id: `assignTo-${defaultId}`,
                          trigger: event.currentTarget,
                        },
                      );
                    }}
                  >
                    {value.length ? (
                      <>
                        <AvatarGroup limit={3}>
                          <AvatarGroupList>
                            {value.map((user) => (
                              <AvatarWrap
                                type="user"
                                key={user.id}
                                id={user.id}
                                name={user.name}
                                url={user.thumbnailUrl}
                                className="h-6 w-6 text-xs"
                              />
                            ))}
                          </AvatarGroupList>
                          <AvatarOverflowIndicator className="h-6 w-6 text-xs" />
                        </AvatarGroup>
                        <span className="runcate">
                          {value.length === 0 && 'Assign to'}
                          {value.length === 1 && value[0].name}
                          {value.length === 2 && value.map(({ name }) => name).join(', ')}
                          {value.length > 2 && `${value.length} assigned`}
                        </span>
                      </>
                    ) : (
                      <>
                        <UserX className="h-4 w-4 opacity-50" /> {t('app:assign_to')}
                      </>
                    )}
                  </Button>
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
        <FormField
          control={form.control}
          name="labels"
          render={({ field: { onChange, value } }) => {
            return (
              <FormItem>
                <FormControl>
                  <Button
                    type="button"
                    aria-label="Set labels"
                    variant="input"
                    size="sm"
                    className="relative flex h-auto justify-start font-light min-h-9 py-1 hover:bg-accent/20"
                    onClick={(event) => {
                      dropdowner(
                        <SetLabels
                          value={value as Label[]}
                          triggerWidth={bounds.width - 3}
                          projectId={projectId}
                          organizationId={organizationId}
                          creationValueChange={onChange}
                        />,
                        { id: `labels-${defaultId}`, trigger: event.currentTarget },
                      );
                    }}
                  >
                    <div className="flex truncate flex-wrap gap-[.07rem]">
                      {value.length > 0 ? (
                        (value as Label[]).map(({ name, id }) => {
                          return (
                            <div key={id} className="flex flex-wrap align-center justify-center items-center rounded-full border pl-2 pr-1 bg-border">
                              <Badge variant="outline" key={id} className="border-0 font-normal px-1 text-[.75rem] text-sm h-6 last:mr-0">
                                {name}
                              </Badge>

                              <button
                                type="button"
                                className={cn(
                                  buttonVariants({ size: 'micro', variant: 'ghost' }),
                                  'opacity-70 hover:opacity-100 rounded-full w-5 h-5 focus-visible:ring-offset-0 active:translate-y-0',
                                )}
                                onClick={(e) => {
                                  e.preventDefault();
                                  onChange(value.filter((l) => l.name !== name));
                                }}
                              >
                                <X size={16} strokeWidth={3} />
                              </button>
                            </div>
                          );
                        })
                      ) : (
                        <>
                          <Tag size={16} className="opacity-50" />
                          <span className="ml-2">{t('app:choose_labels')}</span>
                        </>
                      )}
                    </div>
                  </Button>
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="inline-flex gap-2">
            <div className="flex [&:not(.absolute)]:active:translate-y-[.07rem] ">
              <Button
                size={'xs'}
                type="submit"
                disabled={!isDirty()}
                className={`grow ${isDirty() ? 'rounded-none rounded-l' : 'rounded'} [&:not(.absolute)]:active:translate-y-0`}
              >
                <span>
                  {t('common:create')} {form.getValues('status') === 1 ? '' : ` & ${taskStatuses[form.getValues('status')].status}`}
                </span>
              </Button>
              {isDirty() && (
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field: { onChange } }) => {
                    return (
                      <FormItem className="gap-0 w-8">
                        <FormControl>
                          <Button
                            type="button"
                            aria-label="Set status"
                            variant={'default'}
                            size="xs"
                            className="relative rounded-none rounded-r border-l border-l-background/25 [&:not(.absolute)]:active:translate-y-0"
                            onClick={(event) => {
                              dropdowner(
                                <SelectStatus
                                  taskStatus={form.getValues('status') as TaskStatus}
                                  projectId={projectId}
                                  creationValueChange={onChange}
                                />,
                                {
                                  id: `status-${defaultId}`,
                                  trigger: event.currentTarget,
                                },
                              );
                            }}
                          >
                            <ChevronDown size={16} />
                          </Button>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              )}
            </div>

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
            <Button size={'xs'} type="button" variant="secondary" aria-label="close" onClick={handleCloseForm} className={isDirty() ? 'hidden' : ''}>
              {t('common:close')}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
};

export default CreateTaskForm;
