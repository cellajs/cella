import MDEditor from '@uiw/react-md-editor';
import { useTranslation } from 'react-i18next';
import type { Task } from '~/modules/common/electric/electrify';
import type { Mode } from '~/store/theme';
import CreateSubTaskForm from './create-sub-task-form';
import SubTask from './sub-task';
import { TaskEditor } from './task-selectors/task-editor';
import { useState } from 'react';
import { Button } from '~/modules/ui/button';
import { dispatchCustomEvent } from '~/lib/custom-events';

interface Props {
  task: Task;
  mode: Mode;
  isExpanded: boolean;
  isFocused: boolean;
  handleTaskChange: (field: keyof Task, value: string | number | null, taskId: string) => void;
  isSheet?: boolean;
}

const TaskContent = ({ task, mode, isSheet, isExpanded, isFocused, handleTaskChange }: Props) => {
  const { t } = useTranslation();

  const [createSubTask, setCreateSubTask] = useState(false);

  const handleUpdateMarkdown = (markdownValue: string) => {
    const summaryFromMarkDown = markdownValue.split('\n')[0];
    handleTaskChange('markdown', markdownValue, task.id);
    handleTaskChange('summary', summaryFromMarkDown, task.id);
  };

  return (
    <>
      {!isExpanded ? (
        <div className="inline">
          <MDEditor.Markdown
            source={task.summary || ''}
            style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C' }}
            className="inline summary before:!content-none after:!content-none prose font-light text-start max-w-none"
          />

          <div className="opacity-80 group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 inline ml-1 font-light gap-1">
            <Button variant="link" size="micro" onClick={() => dispatchCustomEvent('toggleCard', task.id)} className="inline-flex py-0 h-5 ml-1">
              {t('common:more').toLowerCase()}
            </Button>
            {task.subTasks.length > 0 && (
              <div className="inline-flex py-0 h-5 ml-1 gap-[.1rem]">
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
          {isFocused ? (
            <TaskEditor mode={mode} markdown={task.markdown || ''} handleUpdateMarkdown={handleUpdateMarkdown} id={task.id} />
          ) : (
            <MDEditor.Markdown
              source={task.markdown || ''}
              style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C' }}
              className="markdown inline before:!content-none after:!content-none prose font-light text-start max-w-none"
            />
          )}

          {!isSheet && (
            <div>
              <Button onClick={() => dispatchCustomEvent('toggleCard', task.id)} variant="link" size="micro" className="py-0 -ml-1">
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
                <SubTask mode={mode} key={task.id} task={task} handleTaskChange={handleTaskChange} />
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
      )}
    </>
  );
};

export default TaskContent;
