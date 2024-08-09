import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dispatchCustomEvent } from '~/lib/custom-events';
import type { Task } from '~/modules/common/electric/electrify';
import { Button } from '~/modules/ui/button';
import type { Mode } from '~/store/theme';
import CreateSubTaskForm from './create-sub-task-form';
import SubTask from './sub-task';
import { TaskBlockNote } from '~/modules/common/blocknotes/task-blocknote';

interface Props {
  task: Task;
  mode: Mode;
  isExpanded: boolean;
  handleTaskChange: (field: keyof Task, value: string | number | null, taskId: string) => void;
  isSheet?: boolean;
}

const TaskContent = ({ task, mode, isSheet, isExpanded, handleTaskChange }: Props) => {
  const { t } = useTranslation();

  const [createSubTask, setCreateSubTask] = useState(false);

  const handleUpdateMarkdown = (description: string, summary: string) => {
    handleTaskChange('summary', summary, task.id);
    handleTaskChange('description', description, task.id);
  };

  return (
    <>
      {!isExpanded ? (
        <div className="mt-1">
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: to avoid using TaskBlockNote for not editing */}
          <div dangerouslySetInnerHTML={{ __html: task.summary as string }} className="inline font-light task-summary" />
          <div className="inline-flex gap-1 items-center opacity-80 group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 px-2">
            {(task.summary !== task.description || task.subTasks.length > 0) && (
              <Button variant="link" size="micro" onClick={() => dispatchCustomEvent('toggleCard', task.id)} className="inline-flex py-0 h-5">
                {t('common:more').toLowerCase()}
              </Button>
            )}
            {task.subTasks.length > 0 && (
              <div className="inline-flex py-0.5 text-xs h-5 ml-1 gap-[.1rem]">
                <span className="text-success">{task.subTasks.filter((t) => t.status === 6).length}</span>
                <span className="font-light">/</span>
                <span className="font-light">{task.subTasks.length}</span>
              </div>
            )}
            {/* <Button variant="ghost" size="micro" onClick={() => setIsExpanded(true)} className="inline-flex py-0 h-5 ml-1 gap-[.07rem]">
               <Paperclip size={10} className="transition-transform -rotate-45" />
               <span>3</span>
             </Button> */}
          </div>
        </div>
      ) : (
        <>
          <TaskBlockNote id={task.id} projectId={task.project_id} html={task.description || ''} handleUpdateHTML={handleUpdateMarkdown} mode={mode} />
          {task.subTasks.length > 0 || task.summary !== task.description ? (
            <div className={`${isSheet ? 'hidden' : ''}`}>
              <Button onClick={() => dispatchCustomEvent('toggleCard', task.id)} variant="link" size="micro" className="py-0 -ml-1">
                {t('common:less').toLowerCase()}
              </Button>
            </div>
          ) : (
            // so ChevronUp can be clickable and add todo don't break UI
            <div className="h-8" />
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
                <SubTask mode={mode} key={task.id} task={task} handleTaskChange={handleTaskChange} />
              ))}
            </div>

            <CreateSubTaskForm formOpen={createSubTask} setFormState={(value) => setCreateSubTask(value)} parentTask={task} />
          </div>
        </>
      )}
    </>
  );
};

export default TaskContent;
