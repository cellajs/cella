import MDEditor from '@uiw/react-md-editor';
import { cva } from 'class-variance-authority';
import { GripVertical, Paperclip } from 'lucide-react';
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
import { SelectImpact } from './task-selectors/select-impact.tsx';
import SelectStatus, { type TaskStatus } from './task-selectors/select-status.tsx';
import { SelectTaskType } from './task-selectors/select-task-type.tsx';
import './style.css';
import { useWorkspaceContext } from '~/modules/workspaces/workspace-context.tsx';
import SetLabels from './task-selectors/select-labels.tsx';
import AssignMembers from './task-selectors/select-members.tsx';
import { TaskEditor } from './task-selectors/task-editor.tsx';
import SubTask from './sub-task-card.tsx';
import CreateSubTaskForm from './create-sub-task-form.tsx';
import type { Member } from '~/types/index.ts';
interface TaskCardProps {
  taskRef: React.RefObject<HTMLDivElement>;
  taskDragButtonRef: React.RefObject<HTMLButtonElement>;
  task: Task;
  labels: Label[];
  subTasks: Task[];
  members: Member[];
  className?: string;
  dragging?: boolean;
  dragOver?: boolean;
}

export function TaskCard({ task, subTasks, labels, members, taskRef, taskDragButtonRef, dragging, dragOver, className = '' }: TaskCardProps) {
  const { t } = useTranslation();
  const { mode } = useThemeStore();
  const { setSelectedTasks, selectedTasks, projects, focusedTaskId, setFocusedTaskId, setFocusedProjectIndex } = useWorkspaceContext(
    ({ setSelectedTasks, selectedTasks, projects, focusedTaskId, setFocusedTaskId, setFocusedProjectIndex }) => ({
      setSelectedTasks,
      selectedTasks,
      projects,
      focusedTaskId,
      setFocusedTaskId,
      setFocusedProjectIndex,
    }),
  );

  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [createSubTask, setCreateSubTask] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const electric = useElectric()!;

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const handleChange = (field: keyof Task, value: any, taskId: string) => {
    const db = electric.db;

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
      onFocus={() => {
        setFocusedTaskId(task.id);
        setFocusedProjectIndex(projects.findIndex((p) => p.id === task.project_id) || 0);
      }}
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
      <CardContent id={`${task.id}-content`} className="p-1 pb-2 space-between flex flex-col relative">
        <div className="flex flex-col gap-1">
          <div className="flex gap-1 w-full">
            <div className="flex flex-col justify-between gap-[2px] relative">
              <Checkbox
                className={cn(
                  'group-[.is-selected]/column:opacity-100 group-[.is-selected]/column:z-30 group-[.is-selected]/column:pointer-events-auto',
                  'transition-all bg-background absolute top-[6px] left-[6px]',
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
                className={cn('group-[.is-selected]/column:mt-[34px] transition-spacing', isExpanded && 'mt-[34px]')}
                currentType={task.type as TaskType}
                changeTaskType={(newType) => handleChange('type', newType, task.id)}
              />
              <Button
                ref={taskDragButtonRef}
                variant={'ghost'}
                size="xs"
                className="max-sm:hidden text-secondary-foreground cursor-grab opacity-15 transition-all group-hover/task:opacity-35 group-[.is-focused]/task:opacity-35 group-[.is-selected]/column:opacity-0 group-[.is-selected]/column:-mt-[34px] group-[.is-selected]/column:pointer-events-none"
              >
                <span className="sr-only"> {t('common:move_task')}</span>
                <GripVertical size={16} />
              </Button>
            </div>
            <div className="flex flex-col grow gap-2 mt-[6px] mr-1">
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
                        <Button variant="ghost" size="micro" onClick={() => setIsExpanded(true)} className="inline-flex py-0 h-5 ml-1 gap-[1px]">
                          <span className="text-success">{subTasks.filter((t) => t.status === 6).length}</span>
                          <span className="font-light">/</span>
                          <span className="font-light">{subTasks.length}</span>
                        </Button>
                      )}
                      <Button variant="ghost" size="micro" onClick={() => setIsExpanded(true)} className="inline-flex py-0 h-5 ml-1 gap-[1px]">
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

              <div className="flex items-start justify-between">
                {task.type !== 'bug' && (
                  <SelectImpact
                    viewValue={task.impact as TaskImpact}
                    mode="edit"
                    changeTaskImpact={(newImpact) => handleChange('impact', newImpact, task.id)}
                  />
                )}

                {
                  // TODO: Bind the entire task object instead of individual IDs
                }
                <SetLabels
                  labels={labels}
                  organizationId={task.organization_id}
                  projectId={task.project_id}
                  changeLabels={(newLabels) => handleChange('labels', newLabels, task.id)}
                  viewValue={labels}
                  mode="edit"
                />

                <div className="flex gap-1 ml-auto mr-1">
                  <AssignMembers
                    mode="edit"
                    users={members}
                    viewValue={members.filter((member) => task.assigned_to?.includes(member.id))}
                    changeAssignedTo={(newMembers) => handleChange('assigned_to', newMembers, task.id)}
                  />
                  <SelectStatus taskStatus={task.status as TaskStatus} changeTaskStatus={(newStatus) => handleChange('status', newStatus, task.id)} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
