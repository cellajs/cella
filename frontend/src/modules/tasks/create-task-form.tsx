import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { useParams } from '@tanstack/react-router';
import { ChevronDown, Tag, UserX, X } from 'lucide-react';
import { useMemo } from 'react';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { queryClient } from '~/lib/router';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { BlockNote } from '~/modules/common/blocknote';
import { dialog } from '~/modules/common/dialoger/state.ts';
import { dropdowner } from '~/modules/common/dropdowner/state.ts';
import { taskKeys, useTaskCreateMutation } from '~/modules/common/query-client-provider/tasks';
import { getNewTaskOrder, handleEditorFocus } from '~/modules/tasks/helpers';
import { NotSelected } from '~/modules/tasks/task-dropdowns/impact-icons/not-selected';
import SelectImpact, { impacts } from '~/modules/tasks/task-dropdowns/select-impact';
import SetLabels from '~/modules/tasks/task-dropdowns/select-labels';
import AssignMembers from '~/modules/tasks/task-dropdowns/select-members';
import SelectStatus, { type TaskStatus, taskStatuses } from '~/modules/tasks/task-dropdowns/select-status';
import { taskTypes } from '~/modules/tasks/task-dropdowns/select-task-type';
import UppyFilePanel from '~/modules/tasks/task-dropdowns/uppy-file-panel';
import { AvatarGroup, AvatarGroupList, AvatarOverflowIndicator } from '~/modules/ui/avatar';
import { Badge } from '~/modules/ui/badge';
import { Button, buttonVariants } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';
import { useWorkspaceQuery } from '~/modules/workspaces/helpers/use-workspace';
import { WorkspaceRoute } from '~/routes/workspaces';
import { useUserStore } from '~/store/user.ts';
import { useWorkspaceStore } from '~/store/workspace';
import type { Label, Task } from '~/types/app';
import type { Member } from '~/types/common';
import { cn } from '~/utils/cn';
import { nanoid } from '~/utils/nanoid';
import { scanTaskDescription } from '#/modules/tasks/helpers';
import { TaskType, createTaskSchema } from '#/modules/tasks/schema';

export type TaskImpact = 0 | 1 | 2 | 3 | null;

interface CreateTaskFormProps {
  projectIdOrSlug?: string;
  className?: string;
  dialog?: boolean;
  defaultValues?: Partial<FormValues>;
  onCloseForm?: () => void;
  onFormSubmit?: (task: Task, isNew?: boolean, toStatus?: TaskStatus) => void;
}

const formSchema = z.object({
  ...createTaskSchema.omit({
    labels: true,
    assignedTo: true,
  }).shape,
  id: z.string(),
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
      lastUsedAt: z.string(),
    }),
  ),
});

type FormValues = z.infer<typeof formSchema>;

const CreateTaskForm: React.FC<CreateTaskFormProps> = ({ projectIdOrSlug, defaultValues, className, dialog: isDialog, onCloseForm }) => {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const { focusedTaskId } = useWorkspaceStore();
  const { orgIdOrSlug } = useParams({ from: WorkspaceRoute.id });

  const {
    data: { members, workspace, projects },
  } = useWorkspaceQuery();

  const defaultId = nanoid();

  const taskMutation = useTaskCreateMutation();

  // Project id is required
  const projectId = projectIdOrSlug || projects[0]?.id;
  if (!projectId) return <>No project id found, please contact support</>;

  // Get  cached tasks
  const queryKey = taskKeys.list({ projectId, orgIdOrSlug });
  const tasks = queryClient.getQueryData<{ items: Task[] }>(queryKey)?.items ?? [];

  const handleCloseForm = () => {
    if (isDialog) {
      if (projectId === '') dialog.remove(false, 'workspace-add-task');
      else dialog.remove(false, `create-task-form-${projectId}`);
    }
    onCloseForm?.();
  };

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        ...{
          id: defaultId,
          description: '',
          summary: '',
          type: TaskType.feature,
          impact: null,
          assignedTo: [],
          labels: [],
          status: 1,
          projectId,
          expandable: false,
          keywords: '',
          order: 0,
        },
        ...defaultValues,
      },
    }),
    [],
  );

  // Form with draft in local storage
  const form = useFormWithDraft<FormValues>(`create-task-${projectId}`, formOptions);

  const onSubmit = async (values: FormValues) => {
    const { summary, keywords, expandable } = scanTaskDescription(values.description);

    const newTask = {
      id: values.id,
      description: values.description,
      summary: values.summary || summary,
      expandable: values.expandable || expandable,
      keywords: values.keywords || keywords,
      type: values.type,
      impact: values.impact as TaskImpact,
      labels: values.labels.map((label) => label.id),
      assignedTo: values.assignedTo.map((user) => user.id),
      status: values.status,
      organizationId: workspace.organizationId,
      projectId: values.projectId,
      createdBy: user.id,
      order: getNewTaskOrder(values.status, tasks),
    };

    taskMutation.mutate(newTask);
    form.reset();
    handleCloseForm();
  };

  const getFieldWidth = () => {
    const element = document.getElementById(`create-task-${projectIdOrSlug}`);
    if (!element) return;
    const styles = getComputedStyle(element);
    return element.clientWidth - Number.parseFloat(styles.paddingLeft) - Number.parseFloat(styles.paddingRight) - 3;
  };

  // default value in blocknote <p class="bn-inline-content"></p> so check if there it's only one
  const isDirty = () => {
    const type = form.getValues('type');
    const assignedTo = form.getValues('assignedTo');
    const status = form.getValues('status');
    const labels = form.getValues('labels');
    const impact = form.getValues('impact');
    if (assignedTo.length || labels.length || status !== 1 || impact || type !== TaskType.feature) return true;
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

  if (form.loading) return null;

  return (
    <Form {...form}>
      <form
        id={`create-task-${projectIdOrSlug}`}
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn(className, `sm:p-3 sm:pl-11 ${isDialog ? '' : 'border-b'} flex gap-2 flex-col sm:shadow-inner`)}
      >
        <FormField
          control={form.control}
          name="description"
          render={({ field: { value, onChange } }) => {
            return (
              <FormItem>
                <FormControl>
                  <BlockNote
                    id={`blocknote-${defaultId}`}
                    members={members}
                    defaultValue={value}
                    className="min-h-16 [&>.bn-editor]:min-h-16"
                    onFocus={() => handleEditorFocus(defaultId, focusedTaskId)}
                    updateData={onChange}
                    onChange={onChange}
                    filePanel={UppyFilePanel(defaultId)}
                    trailingBlock={false}
                    onEnterClick={form.handleSubmit(onSubmit)}
                    onEscapeClick={handleCloseForm}
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
                    value={taskTypes[value - 1].type}
                    onValueChange={(newValue) => {
                      const taskTypeValue = TaskType[newValue as keyof typeof TaskType];
                      if (taskTypeValue !== undefined) onChange(taskTypeValue);
                    }}
                  >
                    {taskTypes.map((type) => (
                      <ToggleGroupItem size="sm" value={type.type} className="w-full" key={type.label}>
                        {type.icon()}
                        <span className="ml-2 font-light">{t(`app:${type.type}`)}</span>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        {form.getValues('type') !== TaskType.bug && (
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
                        dropdowner(
                          <SelectImpact
                            value={selectedImpactValue}
                            projectId={projectId}
                            triggerWidth={getFieldWidth()}
                            creationValueChange={onChange}
                          />,
                          {
                            id: `impact-${defaultId}`,
                            trigger: event.currentTarget,
                          },
                        );
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
                          triggerWidth={getFieldWidth()}
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
                          triggerWidth={getFieldWidth()}
                          projectId={projectId}
                          organizationId={workspace.organizationId}
                          creationValueChange={onChange}
                        />,
                        { id: `labels-${defaultId}`, trigger: event.currentTarget, modal: false },
                      );
                    }}
                  >
                    <div className="flex truncate items-center flex-wrap gap-[.07rem]">
                      {value.length > 0 ? (
                        (value as Label[]).map(({ name, id }) => {
                          return (
                            <div key={id} className="flex flex-wrap align-center justify-center items-center rounded-full border pl-2 pr-1 bg-border">
                              <Badge variant="outline" key={id} className="border-0 font-normal px-1 text-[.75rem] text-sm h-6 last:mr-0">
                                {name}
                              </Badge>
                              <div
                                className={cn(
                                  buttonVariants({ size: 'micro', variant: 'ghost' }),
                                  'opacity-70 hover:opacity-100 rounded-full w-5 h-5 focus-visible:ring-offset-0 active:translate-y-0',
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  onChange(value.filter((l) => l.name !== name));
                                  dropdowner.updateOpenDropDown({
                                    content: (
                                      <SetLabels
                                        value={value.filter((l) => l.name !== name) as Label[]}
                                        triggerWidth={getFieldWidth()}
                                        projectId={projectId}
                                        organizationId={workspace.organizationId}
                                        creationValueChange={onChange}
                                      />
                                    ),
                                  });
                                }}
                                onKeyDown={() => {}}
                              >
                                <X size={16} strokeWidth={3} />
                              </div>
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
                render={({ field: { value, onChange } }) => {
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
                            dropdowner(<SelectStatus taskStatus={value as TaskStatus} projectId={projectId} creationValueChange={onChange} />, {
                              id: `status-${defaultId}`,
                              trigger: event.currentTarget,
                            });
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

          <div className="flex flex-col-reverse sm:flex-row gap-2">
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
