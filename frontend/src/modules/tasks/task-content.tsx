import '@blocknote/shadcn/style.css';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useDoubleClick from '~/hooks/use-double-click';
import { dispatchCustomEvent } from '~/lib/custom-events';
import CreateSubTaskForm from '~/modules/tasks/create-sub-task-form';
import SubTask from '~/modules/tasks/sub-task';
import { TaskBlockNote } from '~/modules/tasks/task-selectors/task-blocknote';
import { Button } from '~/modules/ui/button';
import type { Mode } from '~/store/theme';
import type { Task } from '~/types/app';
import type { TaskStates } from './types';

interface Props {
  task: Task;
  mode: Mode;
  state: TaskStates;
}

const TaskContent = ({ task, mode, state }: Props) => {
  const { t } = useTranslation();
  const taskContentRef = useRef<HTMLDivElement>(null);

  const [createSubTask, setCreateSubTask] = useState(false);

  const expandedStyle = 'min-h-16 [&>.bn-editor]:min-h-16 w-full bg-transparent border-none pl-9';

  useDoubleClick({
    onSingleClick: () => {
      if (state !== 'folded') return;
      dispatchCustomEvent('changeTaskState', { taskId: task.id, state: 'expanded' });
    },
    onDoubleClick: () => {
      if (state === 'editing' || state === 'unsaved') return;
      dispatchCustomEvent('changeTaskState', { taskId: task.id, state: 'editing' });
    },
    allowedTargets: ['p', 'div'],
    ref: taskContentRef,
  });

  useEffect(() => {
    if (state !== 'expanded') return;
    // All elements with a data-url attribute
    const blocks = document.querySelectorAll('[data-url]');
    if (blocks.length < 1) return;

    for (const block of blocks) {
      const url = block.getAttribute('data-url');
      const img = block.querySelector('img');

      //set img src attribute if is inside the block
      if (img && url) img.setAttribute('src', url);
    }
  }, [task.description, state]);

  return (
    <div ref={taskContentRef} className="flex flex-col grow gap-2">
      {state === 'folded' ? (
        <div className="mt-1 inline-flex">
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: is sanitized by backend
            dangerouslySetInnerHTML={{ __html: task.summary }}
            data-color-scheme={mode}
            className="bn-container bn-shadcn pl-1"
          />

          {(task.expandable || task.subTasks.length > 0) && (
            <div className="inline-flex gap-1 items-center opacity-80 group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 pl-2 -mt-[0.15rem]">
              {task.expandable && (
                <Button
                  variant="link"
                  size="micro"
                  onClick={(e) => {
                    e.preventDefault();
                    dispatchCustomEvent('changeTaskState', { taskId: task.id, state: 'expanded' });
                  }}
                  className="inline-flex py-0 h-5"
                >
                  {t('common:more').toLowerCase()}
                </Button>
              )}
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
          {state === 'editing' || state === 'unsaved' ? (
            <TaskBlockNote id={task.id} projectId={task.projectId} html={task.description || ''} mode={mode} className={expandedStyle} />
          ) : (
            <div className={`${expandedStyle} bn-container bn-shadcn`} data-color-scheme={mode}>
              <div
                // biome-ignore lint/security/noDangerouslySetInnerHtml: is sanitized by backend
                dangerouslySetInnerHTML={{ __html: task.description }}
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
