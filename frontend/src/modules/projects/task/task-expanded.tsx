import MDEditor from '@uiw/react-md-editor';
import { type RefObject, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useDoubleClick from '~/hooks/use-double-click.tsx';
import type { Task } from '~/modules/common/electric/electrify';
import { Button } from '~/modules/ui/button';
import type { Mode } from '~/store/theme';
import CreateSubTaskForm from './create-sub-task-form';
import SubTask from './sub-task-card';
import { TaskEditor } from './task-selectors/task-editor';

interface Props {
  task: Task;
  mode: Mode;
  isExpanded: boolean;
  createSubTask: boolean;
  setCreateSubTask: (newState: boolean) => void;
  taskRef: RefObject<HTMLDivElement>;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  handleTaskChange: (field: keyof Task, value: any, taskId: string) => void;
  setIsExpanded?: (exp: boolean) => void;
}

const ExpandedTask = ({ task, createSubTask, taskRef, mode, isExpanded, setIsExpanded, setCreateSubTask, handleTaskChange }: Props) => {
  const { t } = useTranslation();

  const [isEditing, setIsEditing] = useState(false);

  useDoubleClick({
    onDoubleClick: () => {
      setIsEditing(!isEditing);
      setIsExpanded?.(true);
    },
    allowedTargets: ['p', 'div'],
    excludeIds: ['sub-item'],
    ref: taskRef,
    latency: 250,
  });

  if (!isExpanded) return null;
  return (
    <>
      {isEditing ? (
        <TaskEditor
          mode={mode}
          markdown={task.markdown || ''}
          setMarkdown={(newMarkdown) => handleTaskChange('markdown', newMarkdown, task.id)}
          setSummary={(newSummary) => handleTaskChange('summary', newSummary, task.id)}
          id={task.id}
        />
      ) : (
        <MDEditor.Markdown
          source={task.markdown || ''}
          style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C' }}
          className="markdown inline before:!content-none after:!content-none prose font-light text-start max-w-none"
        />
      )}
      {setIsExpanded && (
        <div>
          <Button variant="link" size="micro" onClick={() => setIsExpanded(false)} className="py-0 -ml-1">
            {t('common:less').toLowerCase()}
          </Button>
        </div>
      )}

      {task.subTasks.length > 0 && (
        <div className="inline-flex py-0 h-4 items-center mt-4 gap-1 text-sm">
          <span className="text-success">{task.subTasks.filter((t) => t.status === 6).length}</span>
          <span>/</span>
          <span>{task.subTasks.length}</span>
          <span>{t('common:todos')}</span>
        </div>
      )}

      <div className="-ml-10 -mr-1 relative z-10">
        <div className="flex flex-col">
          {task.subTasks.map((task) => (
            <SubTask mode={mode} key={task.id} task={task} handleChange={handleTaskChange} />
          ))}
        </div>

        <CreateSubTaskForm
          firstSubTask={task.subTasks.length < 1}
          formOpen={createSubTask}
          setFormState={(value) => setCreateSubTask(value)}
          parentTask={task}
        />
      </div>
    </>
  );
};

export default ExpandedTask;
