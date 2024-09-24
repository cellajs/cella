import '@blocknote/shadcn/style.css';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dispatchCustomEvent } from '~/lib/custom-events';
import CreateSubTaskForm from '~/modules/tasks/create-sub-task-form';
import SubTask from '~/modules/tasks/sub-task';
import { TaskBlockNote } from '~/modules/tasks/task-selectors/task-blocknote';
import { Button } from '~/modules/ui/button';
import type { Mode } from '~/store/theme';
import type { Task } from '~/types/app';

interface Props {
  task: Task;
  mode: Mode;
  isExpanded: boolean;
  isEditing: boolean;
}

const TaskContent = ({ task, mode, isExpanded, isEditing }: Props) => {
  const { t } = useTranslation();
  const [createSubTask, setCreateSubTask] = useState(false);

  const expandedStyle = 'min-h-16 [&>.bn-editor]:min-h-16 w-full bg-transparent border-none pl-9';
  return (
    <div className="flex flex-col grow gap-2">
      {!isExpanded ? (
        <div className="mt-1 inline-flex">
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: is sanitized by backend
            dangerouslySetInnerHTML={{ __html: task.summary }}
            data-color-scheme={mode}
            className="bn-container bn-shadcn pl-1"
          />

          {(task.expandable || task.subTasks.length > 0) && (
            <div className="inline-flex gap-1 items-center opacity-80 group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 pl-2 -mt-[0.15rem]">
              <Button variant="link" size="micro" onClick={() => dispatchCustomEvent('toggleTaskExpand', task.id)} className="inline-flex py-0 h-5">
                {t('common:more').toLowerCase()}
              </Button>
              {task.subTasks.length > 0 && (
                <div className="inline-flex py-0.5 text-xs h-5 ml-1 gap-[.1rem] cursor-pointer">
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
          )}
        </div>
      ) : (
        <motion.div initial={{ y: -10 }} animate={{ y: 0 }} exit={{ y: -10 }} transition={{ duration: 0.3 }}>
          {isEditing ? (
            <TaskBlockNote id={task.id} projectId={task.projectId} html={task.description || ''} mode={mode} className={expandedStyle} />
          ) : (
            <div className={`${expandedStyle} bn-container bn-shadcn`} data-color-scheme={mode}>
              <div
                // biome-ignore lint/security/noDangerouslySetInnerHtml: is sanitized by backend
                dangerouslySetInnerHTML={{ __html: task.description }}
                onClick={() => dispatchCustomEvent('toggleTaskEditing', { id: task.id, state: true })}
                onKeyDown={() => {}}
              />
            </div>
          )}

          <div className="-mx-2 mt-2 w-[calc(100%+1.25rem)]">
            <div className="flex flex-col">
              {task.subTasks.map((task) => (
                <SubTask mode={mode} key={task.id} task={task} />
              ))}
            </div>

            <CreateSubTaskForm formOpen={createSubTask} setFormState={(value) => setCreateSubTask(value)} parentTask={task} />
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default TaskContent;
