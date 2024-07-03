import type { Task } from '~/modules/common/electric/electrify';
import { TaskEditor } from './task-selectors/task-editor';
import { useRef, useState } from 'react';
import { useThemeStore } from '~/store/theme';
import MDEditor from '@uiw/react-md-editor';
import { Button } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import { cn } from '~/lib/utils';
import { Trash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useDoubleClick from '~/hooks/use-double-click.tsx';

const SubTask = ({
  task,
  handleChange,
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
}: { task: Task; handleChange: (field: keyof Task, value: any, taskId: string) => void }) => {
  const { t } = useTranslation();
  const { mode } = useThemeStore();
  const subTaskRef = useRef<HTMLDivElement>(null);
  const subContentRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);

  const toggleEditorState = () => {
    setIsEditing(!isEditing);
  };

  useDoubleClick({
    onDoubleClick: () => {
      toggleEditorState();
    },
    allowedTargets: ['p', 'div'],
    ref: subTaskRef,
    latency: 250,
  });

  return (
    <div ref={subTaskRef} id="sub-item" className="flex gap-1 p-1 bg-secondary border-b-2 border-background">
      <div className="flex flex-col justify-between items-center gap-2 relative">
        <Checkbox
          className={cn(
            'group-[.is-selected]/column:opacity-100 group-[.is-selected]/column:z-30 group-[.is-selected]/column:pointer-events-auto',
            'transition-all bg-background w-5 h-5 m-1',
          )}
          checked={task.status === 6}
          onCheckedChange={(checkStatus) => {
            if (checkStatus) handleChange('status', 6, task.id);
            if (!checkStatus) handleChange('status', 1, task.id);
          }}
        />
      </div>
      <div className="flex flex-col grow gap-2 mt-1 mx-1">
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
          <div ref={subContentRef} className="inline">
            <MDEditor.Markdown
              source={isEditing ? task.markdown || '' : task.summary}
              style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C' }}
              className={` ${
                isEditing ? 'markdown' : 'summary'
              } inline before:!content-none after:!content-none prose font-light text-start max-w-none`}
            />
          </div>
        )}
      </div>
      <Button
        //   ref={subTaskDragButtonRef}
        variant={'ghost'}
        size="xs"
        className="max-sm:hidden text-secondary-foreground cursor-pointer opacity-15 transition-all group-hover/task:opacity-35 group-[.is-focused]/task:opacity-35 group-[.is-selected]/column:opacity-0 group-[.is-selected]/column:-mt-8 group-[.is-selected]/column:pointer-events-none"
      >
        <span className="sr-only"> {t('common:move_task')}</span>
        <Trash size={16} />
      </Button>
    </div>
  );
};

export default SubTask;
