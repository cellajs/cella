import '@blocknote/shadcn/style.css';
import { config } from 'config';
import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutateQueryData } from '~/hooks/use-mutate-query-data';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { BlockNote } from '~/modules/common/blocknote';
import { taskKeys } from '~/modules/common/query-client-provider/tasks';
import CreateSubtaskForm from '~/modules/tasks/create-subtask-form';
import Subtask from '~/modules/tasks/subtask';
import UppyFilePanel from '~/modules/tasks/task-dropdowns/uppy-file-panel';
import { useWorkspaceQuery } from '~/modules/workspaces/helpers/use-workspace';
import type { Mode } from '~/store/theme';
import type { Task } from '~/types/app';
import { Button } from '../ui/button';
import { handleEditorFocus, updateImageSourcesFromDataUrl, useHandleUpdateHTML } from './helpers';
import type { TaskStates } from './types';

interface TaskContentProps {
  task: Task;
  mode: Mode;
  state: TaskStates;
  isSheet?: boolean;
}

const TaskDescription = ({ task, mode, state, isSheet }: TaskContentProps) => {
  const { t } = useTranslation();

  const taskContentRef = useRef<HTMLDivElement>(null);
  const [createSubtask, setCreateSubtask] = useState(false);

  const expandedStyle = 'min-h-16 [&>.bn-editor]:min-h-16 w-full bg-transparent border-none pl-9';
  const callback = useMutateQueryData(taskKeys.list({ projectId: task.projectId, orgIdOrSlug: task.organizationId }));

  const subTaskDeleteCallback = (subtaskId: string) => {
    const { subtasks } = task;
    // Filter out the subtask to be removed
    const updatedSubtasks = subtasks.filter((st) => st.id !== subtaskId);
    const updatedTask = { ...task, subtasks: updatedSubtasks };
    callback([updatedTask], 'update');
  };

  const {
    data: { members },
  } = useWorkspaceQuery();

  const { handleUpdateHTML } = useHandleUpdateHTML();
  const updateDescription = (html: string) => handleUpdateHTML(task, html, isSheet);

  useEffect(() => {
    if (state !== 'expanded') return;
    updateImageSourcesFromDataUrl();
  }, [task.description, state]);

  return (
    <div className="flex flex-col grow gap-2">
      {state === 'folded' ? (
        <div className="mt-2 ml-1 leading-none inline items-center">
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: is sanitized by backend
            dangerouslySetInnerHTML={{ __html: task.summary }}
            data-color-scheme={mode}
            className="bn-container bn-shadcn leading-none inline"
          />
          <SummaryButtons task={task} />
        </div>
      ) : (
        <>
          {state === 'editing' || state === 'unsaved' ? (
            <BlockNote
              id={`blocknote-${task.id}`}
              members={members}
              defaultValue={task.description}
              className={expandedStyle}
              onFocus={() => handleEditorFocus(task.id)}
              updateData={updateDescription}
              onEnterClick={() => dispatchCustomEvent('changeTaskState', { taskId: task.id, state: 'expanded' })}
              onTextDifference={() => {
                if (!isSheet) dispatchCustomEvent('changeTaskState', { taskId: task.id, state: 'unsaved' });
              }}
              filePanel={UppyFilePanel(task.id)}
              trailingBlock={false}
              updateDataOnBeforeLoad
            />
          ) : (
            <div ref={taskContentRef} className={`${expandedStyle} bn-container bn-shadcn`} data-color-scheme={mode}>
              <div
                // biome-ignore lint/security/noDangerouslySetInnerHtml: is sanitized by backend
                dangerouslySetInnerHTML={{ __html: task.description }}
              />
            </div>
          )}

          <div id={`subtask-container-${task.id}`} className="-mx-2 mt-2 w-[calc(100%+1.25rem)]">
            <div className="flex flex-col">
              {task.subtasks.map((task) => (
                <Subtask mode={mode} key={task.id} task={task} members={members} removeCallback={subTaskDeleteCallback} />
              ))}
            </div>

            {createSubtask ? (
              <CreateSubtaskForm setFormState={(value) => setCreateSubtask(value)} parentTask={task} />
            ) : (
              <Button variant="ghost" size="sm" className="w-full mb-1 pl-11 justify-start rounded-none" onClick={() => setCreateSubtask(true)}>
                <Plus size={16} />
                <span className="ml-1 font-normal">{t('app:todo')}</span>
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TaskDescription;

const SummaryButtons = ({ task }: { task: Task }) => {
  return (
    <>
      {(task.expandable || task.subtasks.length > 0) && (
        <div className="inline-flex gap-1 items-center opacity-80 group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 -mt-[0.15rem]">
          {task.expandable && <div className="inline-flex px-1 text-sm cursor-pointer py-0 h-5">...</div>}
          {task.subtasks.length > 0 && (
            <div className="inline-flex py-0.5 text-xs h-5 ml-2 gap-[.1rem] cursor-pointer">
              <span className="text-success">{task.subtasks.filter((t) => t.status === 6).length}</span>
              <span className="font-light">/</span>
              <span className="font-light">{task.subtasks.length}</span>
            </div>
          )}
          {/* <Button variant="ghost" size="micro" onClick={() => setIsExpanded(true)} className="inline-flex py-0 h-5 ml-1 gap-[.07rem]">
         <Paperclip size={10} className="transition-transform -rotate-45" />
         <span>3</span>
       </Button> */}
        </div>
      )}
      {/*  in debug mode: show order number to debug drag */}
      {config.debug && <span className="ml-2 opacity-15 text-sm text-center font-light">#{task.order}</span>}
    </>
  );
};
