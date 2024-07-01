import MDEditor from '@uiw/react-md-editor';
import { cva } from 'class-variance-authority';
import { Paperclip, UserX, Tag, ChevronDown } from 'lucide-react';
import { type MouseEventHandler, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useDoubleClick from '~/hooks/use-double-click.tsx';
import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { cn } from '~/lib/utils.ts';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { useThemeStore } from '~/store/theme';
import { type Label, type Task, useElectric } from '../../common/electric/electrify.ts';
import { Checkbox } from '../../ui/checkbox.tsx';
import type { TaskImpact, TaskType } from './create-task-form.tsx';
import { impacts, SelectImpact } from './task-selectors/select-impact.tsx';
import SelectStatus, { taskStatuses, statusVariants, type TaskStatus } from './task-selectors/select-status.tsx';
import { SelectTaskType } from './task-selectors/select-task-type.tsx';
import './style.css';
import { useWorkspaceContext } from '~/modules/workspaces/workspace-context.tsx';
import SetLabels, { badgeStyle } from './task-selectors/select-labels.tsx';
import AssignMembers from './task-selectors/select-members.tsx';
import { TaskEditor } from './task-selectors/task-editor.tsx';
import SubTask from './sub-task-card.tsx';
import CreateSubTaskForm from './create-sub-task-form.tsx';
import type { Member } from '~/types/index.ts';
import { NotSelected } from './task-selectors/impact-icons/not-selected.tsx';
import { AvatarGroup, AvatarGroupList, AvatarOverflowIndicator } from '~/modules/ui/avatar';
import { AvatarWrap } from '~/modules/common/avatar-wrap.tsx';
import { Badge } from '../../ui/badge.tsx';
import { toast } from 'sonner';
import { getTaskOrder } from './helpers.ts';

interface TaskCardProps {
  taskRef: React.RefObject<HTMLDivElement>;
  taskDragRef: React.RefObject<HTMLDivElement>;
  task: Task;
  labels: Label[];
  subTasks: Task[];
  sameProjectTasks: Task[];
  members: Member[];
  className?: string;
  dragging?: boolean;
  dragOver?: boolean;
}

export function TaskCard({
  task,
  subTasks,
  labels,
  sameProjectTasks,
  members,
  taskRef,
  taskDragRef,
  dragging,
  dragOver,
  className = '',
}: TaskCardProps) {
  const { t } = useTranslation();
  const { mode } = useThemeStore();
  const { setSelectedTasks, selectedTasks, focusedTaskId } = useWorkspaceContext(({ setSelectedTasks, selectedTasks, focusedTaskId }) => ({
    setSelectedTasks,
    selectedTasks,
    focusedTaskId,
  }));
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [createSubTask, setCreateSubTask] = useState(false);

  const selectedImpact = task.impact !== null ? impacts[task.impact] : null;

  const contentRef = useRef<HTMLDivElement>(null);

  const Electric = useElectric();

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const handleChange = (field: keyof Task, value: any, taskId: string) => {
    if (!Electric) return toast.error(t('common:local_db_inoperable'));
    const db = Electric.db;
    if (field === 'assigned_to' && Array.isArray(value)) {
      db.tasks.update({
        data: {
          assigned_to: value.map((user) => user.id),
        },
        where: {
          id: taskId,
        },
      });
      return;
    }

    // TODO: Review this
    if (field === 'labels' && Array.isArray(value)) {
      db.tasks.update({
        data: {
          labels: value.map((label) => label.id),
        },
        where: {
          id: taskId,
        },
      });
      return;
    }
    if (field === 'status') {
      const newOrder = getTaskOrder(
        task.status,
        value,
        sameProjectTasks.filter((t) => t.project_id === task.project_id),
      );
      db.tasks.update({
        data: {
          status: value,
          ...(newOrder && { sort_order: newOrder }),
        },
        where: {
          id: taskId,
        },
      });
      return;
    }

    db.tasks.update({
      data: {
        [field]: value,
      },
      where: {
        id: taskId,
      },
    });
  };

  const variants = cva('task-card', {
    variants: {
      dragging: {
        over: 'ring-2 opacity-30',
        overlay: 'ring-2 ring-primary',
      },
      status: {
        0: 'to-sky-500/10 border-b-sky-500/20',
        1: '',
        2: 'to-slate-500/10 border-b-slate-500/20',
        3: 'to-lime-500/10 border-b-lime-500/20',
        4: 'to-yellow-500/10 border-b-yellow-500/20',
        5: 'to-orange-500/10 border-b-orange-500/20',
        6: 'to-green-500/10 border-b-green-500/20',
      },
    },
  });

  const toggleEditorState = () => {
    setIsEditing(!isEditing);
  };

  // Pressing ENTER on markdown when focused and expanded should set isEditing to true
  const handleMarkdownClick: MouseEventHandler<HTMLDivElement> = (event) => {
    if (!isExpanded) return;
    if (document.activeElement === event.currentTarget) setIsEditing(true);
  };

  useDoubleClick({
    onDoubleClick: () => {
      toggleEditorState();
      setIsExpanded(true);
    },
    allowedTargets: ['p', 'div'],
    excludeIds: ['sub-item'],
    ref: taskRef,
    latency: 250,
  });

  // console.log('rerender task');

  const handleEscKeyPress = () => {
    if (focusedTaskId !== task.id) return;
    setIsExpanded(false);
  };
  const handleEnterKeyPress = () => {
    if (focusedTaskId !== task.id) return;
    setIsExpanded(true);
  };

  useHotkeys([
    ['Escape', handleEscKeyPress],
    ['Enter', handleEnterKeyPress],
  ]);

  const dispatchCustomFocusEvent = (taskId: string, projectId: string) => {
    const event = new CustomEvent('task-card-focus', {
      detail: {
        taskId,
        projectId,
      },
    });
    document.dispatchEvent(event);
  };

  useEffect(() => {
    if (!dragging) return;
    setIsEditing(false);
    setIsExpanded(false);
  }, [dragging]);

  return (
    <Card
      onMouseDown={() => {
        if (isEditing) return;
        taskRef.current?.focus();
      }}
      onFocus={() => dispatchCustomFocusEvent(task.id, task.project_id)}
      tabIndex={focusedTaskId === task.id ? 0 : -1}
      ref={taskRef}
      className={cn(
        `group/task relative rounded-none border-0 border-b text-sm bg-transparent hover:bg-card/20 bg-gradient-to-br from-transparent focus:outline-none 
        focus-visible:none
        via-transparent via-60% to-100% opacity-${dragging ? '30' : '100'} ${dragOver ? 'bg-card/20' : ''} ${
          isExpanded ? 'is-expanded' : 'is-collapsed'
        }`,
        variants({
          status: task.status as TaskStatus,
        }),
        className,
      )}
    >
      <CardContent id={`${task.id}-content`} ref={taskDragRef} className="p-1 pb-2 space-between flex flex-col relative">
        <div className="flex flex-col gap-1">
          <div className="flex gap-1 w-full">
            <div className="flex flex-col justify-between gap-0.5 relative">
              <Checkbox
                className={cn(
                  'group-[.is-selected]/column:opacity-100 group-[.is-selected]/column:z-30 group-[.is-selected]/column:pointer-events-auto',
                  'transition-all bg-background absolute top-1.5 left-1.5',
                  !isExpanded && 'opacity-0 -z-[1] pointer-events-none',
                  isExpanded && 'opacity-100',
                )}
                checked={selectedTasks.includes(task.id)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedTasks([...selectedTasks, task.id]);
                    return;
                  }
                  setSelectedTasks(selectedTasks.filter((id) => id !== task.id));
                }}
              />
              <SelectTaskType
                className={cn('group-[.is-selected]/column:mt-8 transition-spacing', isExpanded && 'mt-8')}
                currentType={task.type as TaskType}
                changeTaskType={(newType) => handleChange('type', newType, task.id)}
              />
            </div>
            <div className="flex flex-col grow gap-2 mt-1.5 mr-1">
              {isEditing && (
                <TaskEditor
                  mode={mode}
                  markdown={task.markdown || ''}
                  setMarkdown={(newMarkdown) => handleChange('markdown', newMarkdown, task.id)}
                  setSummary={(newSummary) => handleChange('summary', newSummary, task.id)}
                  toggleEditorState={toggleEditorState}
                  id={task.id}
                />
              )}
              {!isEditing && (
                // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
                <div ref={contentRef} onClick={handleMarkdownClick} className="inline">
                  <MDEditor.Markdown
                    source={isExpanded ? task.markdown || '' : task.summary}
                    style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C' }}
                    className={` ${
                      isExpanded ? 'markdown' : 'summary'
                    } inline before:!content-none after:!content-none prose font-light text-start max-w-none`}
                  />

                  {!isExpanded && (
                    <div className="opacity-50 group-hover/task:opacity-70 group-[.is-focused]/task:opacity-70 text-xs inline font-light gap-1">
                      <Button variant="link" size="micro" onClick={() => setIsExpanded(true)} className="inline-flex py-0 h-5 ml-1">
                        {t('common:more').toLowerCase()}
                      </Button>
                      {subTasks.length > 0 && (
                        <Button variant="ghost" size="micro" onClick={() => setIsExpanded(true)} className="inline-flex py-0 h-5 ml-1 gap-[.07rem]">
                          <span className="text-success">{subTasks.filter((t) => t.status === 6).length}</span>
                          <span className="font-light">/</span>
                          <span className="font-light">{subTasks.length}</span>
                        </Button>
                      )}
                      <Button variant="ghost" size="micro" onClick={() => setIsExpanded(true)} className="inline-flex py-0 h-5 ml-1 gap-[.07rem]">
                        <Paperclip size={10} className="transition-transform -rotate-45" />
                        <span>3</span>
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {isExpanded && (
                <>
                  <div>
                    <Button variant="link" size="micro" onClick={() => setIsExpanded(false)} className="py-0 opacity-70">
                      {t('common:less').toLowerCase()}
                    </Button>
                  </div>

                  {subTasks.length > 0 && (
                    <div className="inline-flex py-0 h-4 items-center mt-4 gap-1">
                      <span className="text-success">{subTasks.filter((t) => t.status === 6).length}</span>
                      <span>/</span>
                      <span>{subTasks.length}</span>
                      <span>{t('common:completed_todo')}</span>
                    </div>
                  )}

                  <div className="-ml-10 -mr-2">
                    <div className="flex flex-col">
                      {subTasks.map((task) => (
                        <SubTask key={task.id} task={task} handleChange={handleChange} />
                      ))}
                    </div>

                    <CreateSubTaskForm
                      firstSubTask={subTasks.length < 1}
                      formOpen={createSubTask}
                      setFormState={(value) => setCreateSubTask(value)}
                      parentTaskId={task.id}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-start justify-between gap-1">
            {task.type !== 'bug' && (
              <SelectImpact value={task.impact as TaskImpact} changeTaskImpact={(newImpact) => handleChange('impact', newImpact, task.id)}>
                <Button
                  aria-label="Set impact"
                  variant="ghost"
                  size="xs"
                  className="group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-70"
                >
                  {selectedImpact !== null ? (
                    <selectedImpact.icon className="size-4" aria-hidden="true" title="Set impact" />
                  ) : (
                    <NotSelected className="size-4 fy" aria-hidden="true" title="Set impact" />
                  )}
                </Button>
              </SelectImpact>
            )}

            {
              // TODO: Bind the entire task object instead of individual IDs
            }
            <SetLabels
              labels={labels}
              value={labels.filter((l) => task.labels?.includes(l.id))}
              organizationId={task.organization_id}
              projectId={task.project_id}
              changeLabels={(newLabels) => handleChange('labels', newLabels, task.id)}
            >
              <Button
                aria-label="Set labels"
                variant="ghost"
                size="xs"
                className="flex h-auto justify-start font-light py-0.5 min-h-8 min-w-8 group-hover/task:opacity-70 group-[.is-focused]/task:opacity-70 opacity-50"
              >
                <div className="flex truncate flex-wrap gap-[.07rem]">
                  {labels.filter((l) => task.labels?.includes(l.id)).length > 0 ? (
                    labels
                      .filter((l) => task.labels?.includes(l.id))
                      .map(({ name, id, color }) => {
                        return (
                          <div
                            key={id}
                            style={badgeStyle(color)}
                            className="flex flex-wrap align-center justify-center items-center rounded-full border pl-2 pr-1 bg-border"
                          >
                            <Badge variant="outline" key={id} className="border-0 font-normal px-1 text-[.75rem] h-5 bg-transparent last:mr-0">
                              {name}
                            </Badge>
                          </div>
                        );
                      })
                  ) : (
                    <Tag size={16} className="opacity-50" />
                  )}
                </div>
              </Button>
            </SetLabels>
            <div className="flex gap-1 ml-auto mr-1">
              <AssignMembers
                users={members}
                value={members.filter((m) => task.assigned_to?.includes(m.id))}
                changeAssignedTo={(newMembers) => handleChange('assigned_to', newMembers, task.id)}
              >
                <Button
                  aria-label="Assign"
                  variant="ghost"
                  size="xs"
                  className="flex justify-start gap-2 group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-70"
                >
                  {members.filter((m) => task.assigned_to?.includes(m.id)).length ? (
                    <AvatarGroup limit={3}>
                      <AvatarGroupList>
                        {members
                          .filter((m) => task.assigned_to?.includes(m.id))
                          .map((user) => (
                            <AvatarWrap type="USER" key={user.id} id={user.id} name={user.name} url={user.thumbnailUrl} className="h-6 w-6 text-xs" />
                          ))}
                      </AvatarGroupList>
                      <AvatarOverflowIndicator className="h-6 w-6 text-xs" />
                    </AvatarGroup>
                  ) : (
                    <UserX className="h-4 w-4 opacity-50" />
                  )}
                </Button>
              </AssignMembers>
              <SelectStatus
                taskStatus={task.status as TaskStatus}
                changeTaskStatus={(newStatus) => {
                  handleChange('status', newStatus, task.id);
                  toast.success(t('common:success.new_status', { status: t(taskStatuses[newStatus as TaskStatus].status).toLowerCase() }));
                }}
                nextButton={
                  <Button
                    variant="outlineGhost"
                    size="xs"
                    className={cn(
                      'border-r-0 rounded-r-none font-normal [&:not(.absolute)]:active:translate-y-0 disabled:opacity-100',
                      statusVariants({ status: task.status as TaskStatus }),
                    )}
                    onClick={() => {
                      handleChange('status', task.status + 1, task.id);
                      toast.success(
                        t('common:success.new_status', { status: t(taskStatuses[(task.status + 1) as TaskStatus].status).toLowerCase() }),
                      );
                    }}
                    disabled={(task.status as TaskStatus) === 6}
                  >
                    {t(taskStatuses[task.status as TaskStatus].action)}
                  </Button>
                }
                inputPlaceholder={t('common:placeholder.set_status')}
                trigger={
                  <Button
                    aria-label="Set status"
                    variant="outlineGhost"
                    size="xs"
                    className={cn(
                      statusVariants({ status: task.status as TaskStatus }),
                      'rounded-none rounded-r -ml-2 [&:not(.absolute)]:active:translate-y-0',
                    )}
                  >
                    <ChevronDown size={12} />
                  </Button>
                }
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
