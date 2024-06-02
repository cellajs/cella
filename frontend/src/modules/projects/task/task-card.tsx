import MDEditor from '@uiw/react-md-editor';
import { cva } from 'class-variance-authority';
import { GripVertical, Paperclip } from 'lucide-react';
import { type MouseEventHandler, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useDoubleClick from '~/hooks/use-double-click.tsx';
import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { cn } from '~/lib/utils.ts';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { useThemeStore } from '~/store/theme';
import { type PreparedTask, useElectric } from '../../common/electric/electrify.ts';
import { Checkbox } from '../../ui/checkbox.tsx';
import { WorkspaceContext } from '../../workspaces/index.tsx';
import type { TaskImpact, TaskType } from './create-task-form.tsx';
import { SelectImpact } from './task-selectors/select-impact.tsx';
import SelectStatus, { type TaskStatus } from './task-selectors/select-status.tsx';
import { SelectTaskType } from './task-selectors/select-task-type.tsx';
import './style.css';
import { toast } from 'sonner';
import { TaskContext } from '../board/board-column.tsx';
import { ProjectContext } from '../board/project-context.ts';
import SetLabels from './task-selectors/select-labels.tsx';
import { TaskEditor } from './task-selectors/task-editor.tsx';
import AssignMembers from './task-selectors/select-members.tsx';
import SelectParent from './task-selectors/select-parent.tsx';
import SetSubTasks from './task-selectors/select-sub-tasks.tsx';

interface TaskCardProps {
  taskRef: React.RefObject<HTMLDivElement>;
  taskDragButtonRef: React.RefObject<HTMLButtonElement>;
  className?: string;
  dragging?: boolean;
  dragOver?: boolean;
}

export function TaskCard({ taskRef, taskDragButtonRef, dragging, dragOver, className = '' }: TaskCardProps) {
  const { t } = useTranslation();
  const { mode } = useThemeStore();
  const { setSelectedTasks, selectedTasks, tasks } = useContext(WorkspaceContext);
  const { labels } = useContext(ProjectContext);

  const { task, focusedTaskId, setFocusedTask, projectMembers } = useContext(TaskContext);
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);

  const Electric = useElectric();

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const handleChange = (field: keyof PreparedTask, value: any) => {
    if (!Electric) return toast.error(t('common:local_db_inoperable'));
    const db = Electric.db;

    if (field === 'parent_id') {
      db.tasks.update({
        data: {
          parent_id: value,
        },
        where: {
          id: task.id,
        },
      });
      return;
    }

    if (field === 'other_tasks' && Array.isArray(value)) {
      const subTasks = tasks.filter((t) => t.parent_id === task.id);
      for (const subTask of subTasks.length > 0 ? subTasks : value) {
        db.tasks.update({
          data: {
            parent_id: value.find((t) => t.id === subTask.id) ? task.id : null,
          },
          where: {
            id: subTask.id,
          },
        });
      }
      return;
    }

    if (field === 'assigned_to' && Array.isArray(value)) {
      db.tasks.update({
        data: {
          assigned_to: value.map((user) => user.id),
        },
        where: {
          id: task.id,
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
          id: task.id,
        },
      });
      return;
    }

    db.tasks.update({
      data: {
        [field]: value,
      },
      where: {
        id: task.id,
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
        setFocusedTask(task.id);
        taskRef.current?.focus();
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
      <CardContent id={`${task.id}-content`} className="p-2 space-between gap-1 flex flex-col relative">
        <div className="flex flex-col gap-1">
          <div className="flex gap-2 w-full">
            <div className="flex flex-col gap-2 relative mt-[2px]">
              <SelectTaskType className="z-20" currentType={task.type as TaskType} changeTaskType={(newType) => handleChange('type', newType)} />
              <Checkbox
                className={cn(
                  'group-[.is-selected]/column:opacity-100 group-[.is-selected]/column:z-30 group-[.is-selected]/column:scale-100 group-[.is-selected]/column:m-0',
                  'transition-all duration-700 bg-background absolute',
                  !isExpanded && 'opacity-0 mt-2 ml-[6px] scale-[.6] cursor-default z-0',
                  isExpanded && 'opacity-100 mt-6',
                )}
                checked={selectedTasks.includes(task.id)}
                onCheckedChange={(checked) => {
                  setSelectedTasks((prev) => {
                    if (checked) return [...prev, task.id];
                    return prev.filter((id) => id !== task.id);
                  });
                }}
              />
            </div>
            <div className="flex flex-col grow gap-2">
              {isEditing && (
                <TaskEditor
                  mode={mode}
                  markdown={task.markdown || ''}
                  setMarkdown={(newMarkdown) => handleChange('markdown', newMarkdown)}
                  setSummary={(newSummary) => handleChange('summary', newSummary)}
                  toggleEditorState={toggleEditorState}
                  id={task.id}
                />
              )}
              {!isEditing && (
                // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
                <div
                  ref={contentRef}
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: <explanation>
                  tabIndex={0}
                  onClick={handleMarkdownClick}
                  className="inline ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 rounded-sm focus-visible:ring-ring focus-visible:ring-offset-2"
                >
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
                      <Button variant="ghost" size="micro" onClick={() => setIsExpanded(true)} className="inline-flex py-0 h-5 ml-1 gap-[1px]">
                        <span className="text-success">1</span>
                        <span className="font-light">/</span>
                        <span className="font-light">3</span>
                      </Button>
                      <Button variant="ghost" size="micro" onClick={() => setIsExpanded(true)} className="inline-flex py-0 h-5 ml-1 gap-[1px]">
                        <Paperclip size={10} className="transition-transform -rotate-45" />
                        <span>3</span>
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {isExpanded && (
                <div>
                  <div className="font-light py-4">[here will we show attachments and todos as a checklist]</div>
                  <Button variant="link" size="micro" onClick={() => setIsExpanded(false)} className="py-0 h-5 -ml-1 opacity-70">
                    {t('common:less').toLowerCase()}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="max-sm:-ml-1 flex items-center justify-between gap-1">
            <Button
              ref={taskDragButtonRef}
              variant={'ghost'}
              className="max-sm:hidden py-1 px-0 text-secondary-foreground h-auto cursor-grab opacity-15 transition-opacity group-hover/task:opacity-35 group-[.is-focused]/task:opacity-35"
            >
              <span className="sr-only"> {t('common:move_task')}</span>
              <GripVertical size={16} />
            </Button>

            {task.type !== 'bug' && (
              <SelectImpact viewValue={task.impact as TaskImpact} mode="edit" changeTaskImpact={(newImpact) => handleChange('impact', newImpact)} />
            )}

            <SetLabels
              labels={labels}
              projectId={task.project_id}
              changeLabels={(newLabels) => handleChange('labels', newLabels)}
              viewValue={task.labels}
              mode="edit"
            />

            <SelectParent
              mode="edit"
              tasks={tasks.filter((t) => t.id !== task.id)}
              parent={task.tasks}
              onChange={(newParentTask) => handleChange('parent_id', newParentTask?.id || null)}
            />

            <SetSubTasks
              mode="edit"
              tasks={tasks.filter((t) => t.id !== task.id && t.id !== task.parent_id)}
              // TODO: refactor this with db relation
              viewValue={tasks.filter((t) => t.parent_id === task.id)}
              onChange={(newSubTasks) => handleChange('other_tasks', newSubTasks)}
            />

            <div className="grow h-0" />

            <div className="flex gap-2 ml-auto">
              <AssignMembers
                mode="edit"
                users={projectMembers}
                viewValue={projectMembers.filter((member) => task.assigned_to?.includes(member.id))}
                changeAssignedTo={(newMembers) => handleChange('assigned_to', newMembers)}
              />
              <SelectStatus taskStatus={task.status as TaskStatus} changeTaskStatus={(newStatus) => handleChange('status', newStatus)} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
