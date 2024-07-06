import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import MDEditor from '@uiw/react-md-editor';
import { UserX, Tag, X, ChevronDown } from 'lucide-react';
import { type LegacyRef, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { cn, nanoid } from '~/lib/utils.ts';
import { Button, buttonVariants } from '~/modules/ui/button';
import { useThemeStore } from '~/store/theme.ts';
import { useUserStore } from '~/store/user.ts';
import { dialog } from '~/modules/common/dialoger/state.ts';
import { type Label, type Task, useElectric } from '~/modules/common/electric/electrify.ts';
import { Form, FormControl, FormField, FormItem, FormMessage } from '../../ui/form.tsx';
import { ToggleGroup, ToggleGroupItem } from '../../ui/toggle-group.tsx';
import { impacts, SelectImpact } from './task-selectors/select-impact.tsx';
import SetLabels, { badgeStyle } from './task-selectors/select-labels.tsx';
import SelectStatus, { type TaskStatus } from './task-selectors/select-status.tsx';
import { NotSelected } from './task-selectors/impact-icons/not-selected.tsx';
import { useMeasure } from '~/hooks/use-measure';
import AssignMembers from './task-selectors/select-members.tsx';
import { AvatarGroup, AvatarGroupList, AvatarOverflowIndicator } from '~/modules/ui/avatar';
import { AvatarWrap } from '~/modules/common/avatar-wrap.tsx';
import type { Member } from '~/types/index.ts';
import { Badge } from '../../ui/badge.tsx';
import { getNewTaskOrder } from './helpers.ts';
import { dropdowner } from '~/modules/common/dropdowner/state.ts';
import { taskTypes } from './task-selectors/select-task-type.tsx';

export type TaskType = 'feature' | 'chore' | 'bug';
export type TaskImpact = 0 | 1 | 2 | 3 | null;

interface CreateTaskFormProps {
  tasks: Task[];
  labels: Label[];
  members: Member[];
  projectId: string;
  organizationId: string;
  dialog?: boolean;
  onCloseForm?: () => void;
  onFormSubmit?: (task: Task, isNew?: boolean, toStatus?: TaskStatus) => void;
}

const formSchema = z.object({
  id: z.string(),
  summary: z.string(),
  markdown: z.string(),
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
      project_id: z.string(),
    }),
  ),
  status: z.number(),
});

type FormValues = z.infer<typeof formSchema>;

const CreateTaskForm: React.FC<CreateTaskFormProps> = ({ tasks, labels, members, projectId, organizationId, dialog: isDialog, onCloseForm }) => {
  const { t } = useTranslation();
  const { mode } = useThemeStore();
  const { user } = useUserStore(({ user }) => ({ user }));
  const defaultId = nanoid();
  const { ref, bounds } = useMeasure();
  const Electric = useElectric();

  const handleCloseForm = () => {
    if (isDialog) dialog.remove();
    onCloseForm?.();
  };

  const handleMDEscKeyPress: React.KeyboardEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      if (event.key !== 'Escape') return;
      handleCloseForm();
    },
    [handleCloseForm],
  );

  const handleHotKeysKeyPress = useCallback(() => {
    handleCloseForm();
  }, [handleCloseForm]);

  useHotkeys([['Escape', handleHotKeysKeyPress]]);

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        id: defaultId,
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

  const createLabel = (newLabel: Label) => {
    if (!Electric) return toast.error(t('common:local_db_inoperable'));
    // TODO: Implement the following
    // Save the new label to the database
    Electric.db.labels.create({ data: newLabel });
  };

  // Form with draft in local storage
  const form = useFormWithDraft<FormValues>(`create-task-${projectId}`, formOptions);

  const onSubmit = (values: FormValues) => {
    if (!Electric) return toast.error(t('common:local_db_inoperable'));
    const summary = values.markdown.split('\n')[0];
    const slug = summary.toLowerCase().replace(/ /g, '-');
    const projectTasks = tasks.filter((task) => task.project_id === projectId);

    Electric.db.tasks
      .create({
        data: {
          id: values.id,
          markdown: values.markdown,
          summary: summary,
          type: values.type as TaskType,
          impact: values.impact as TaskImpact,
          labels: values.labels.map((label) => label.id),
          assigned_to: values.assignedTo.map((user) => user.id),
          status: values.status,
          organization_id: organizationId,
          project_id: projectId,
          created_at: new Date(),
          created_by: user.id,
          slug: slug,
          sort_order: getNewTaskOrder(values.status, projectTasks),
        },
      })
      .then(() => {
        form.reset();
        toast.success(t('common:success.create_resource', { resource: t('common:task') }));
        handleCloseForm();
      });
  };
  // Fix types
  return (
    <Form {...form}>
      <form
        ref={ref as LegacyRef<HTMLFormElement>}
        id="create-task"
        onSubmit={form.handleSubmit(onSubmit)}
        className="p-3 border-b flex gap-2 flex-col shadow-inner"
      >
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
                    textareaProps={{ placeholder: t('common:placeholder.mdEditor') }}
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
                        <span className="ml-2 font-light">{t(`common:${type.value}`)}</span>
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
                      variant="ghost"
                      size="sm"
                      className="relative w-full text-left font-light flex gap-2 justify-start border"
                      type="button"
                      onClick={(event) => {
                        dropdowner(<SelectImpact value={selectedImpactValue} triggerWidth={bounds.width - 3} changeTaskImpact={onChange} />, {
                          id: `impact-${defaultId}`,
                          trigger: event.currentTarget,
                        });
                      }}
                    >
                      {selectedImpact !== null ? (
                        <>
                          <selectedImpact.icon className="size-4" aria-hidden="true" title="Set impact" />
                          {selectedImpact.label}
                        </>
                      ) : (
                        <>
                          <NotSelected className="size-4" aria-hidden="true" title="Set impact" />
                          {t('common:set_impact')}
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
                    variant="ghost"
                    size="sm"
                    className="relative flex justify-start gap-2 font-light w-full text-left border"
                    type="button"
                    onClick={(event) => {
                      dropdowner(
                        <AssignMembers users={members} value={value as Member[]} triggerWidth={bounds.width - 3} changeAssignedTo={onChange} />,
                        {
                          id: `assign_to-${defaultId}`,
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
                                type="USER"
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
                        <span className="ml-2 truncate">
                          {value.length === 0 && 'Assign to'}
                          {value.length === 1 && value[0].name}
                          {value.length === 2 && value.map(({ name }) => name).join(', ')}
                          {value.length > 2 && `${value.length} assigned`}
                        </span>
                      </>
                    ) : (
                      <>
                        <UserX className="h-4 w-4 opacity-50" /> {t('common:assign_to')}
                      </>
                    )}
                  </Button>
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        {
          // TODO: Bind the entire project object instead of individual IDs
        }
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
                    variant="ghost"
                    size="sm"
                    className="relative flex h-auto justify-start font-light w-full text-left min-h-9 py-1 border hover:bg-accent/20"
                    onClick={(event) => {
                      dropdowner(
                        <SetLabels
                          labels={labels}
                          value={value as Label[]}
                          triggerWidth={bounds.width - 3}
                          projectId={projectId}
                          organizationId={organizationId}
                          changeLabels={onChange}
                          createLabel={createLabel}
                        />,
                        { id: `labels-${defaultId}`, trigger: event.currentTarget },
                      );
                    }}
                  >
                    <div className="flex truncate flex-wrap gap-[.07rem]">
                      {value.length > 0 ? (
                        value.map(({ name, id, color }) => {
                          return (
                            <div
                              key={id}
                              style={badgeStyle(color)}
                              className="flex flex-wrap align-center justify-center items-center rounded-full border pl-2 pr-1 bg-border"
                            >
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
                          <span className="ml-2">{t('common:choose_labels')}</span>
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
          <div className="flex [&:not(.absolute)]:active:translate-y-[.07rem]">
            <Button
              size={'xs'}
              type="submit"
              disabled={!form.formState.isDirty}
              className={`grow ${form.formState.isDirty ? 'rounded-none rounded-l' : 'rounded'} [&:not(.absolute)]:active:translate-y-0`}
            >
              <span>{t('common:create')}</span>
            </Button>
            {form.formState.isDirty && (
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
                                taskStatus={1}
                                changeTaskStatus={(newStatus) => {
                                  onChange(newStatus);
                                  onSubmit(form.getValues());
                                }}
                                inputPlaceholder={t('common:placeholder.create_with_status')}
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
