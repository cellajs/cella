import { cva } from 'class-variance-authority';
import { ChevronDown } from 'lucide-react';
import { useContext, useMemo, useRef, useState } from 'react';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';
import { TaskCard } from './task-card';
import { BoardColumnHeader } from './board-column-header';
import { ProjectSettings } from './project-settings';
import { sheet } from '../common/sheeter/state';
import CreateTaskForm from './create-task-form';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '~/store/workspace';
import type { Task } from '../common/root/electric';
import { ProjectContext } from './board';

interface BoardColumnProps {
  tasks?: Task[];
}

export function BoardColumn({ tasks = [] }: BoardColumnProps) {
  const { t } = useTranslation();

  const containerRef = useRef(null);

  const { project } = useContext(ProjectContext);
  const { workspaces, changeColumn } = useWorkspaceStore();
  const currentProjectSettings = workspaces[project.workspace_id]?.columns.find((el) => el.columnId === project.id);

  const acceptedCount = useMemo(() => tasks?.filter((t) => t.status === 6).length, [tasks]);
  const icedCount = useMemo(() => tasks?.filter((t) => t.status === 0).length, [tasks]);

  const [showIced, setShowIced] = useState(currentProjectSettings?.expandIced || false);
  const [showAccepted, setShowAccepted] = useState(currentProjectSettings?.expandAccepted || false);
  const [createForm, setCreateForm] = useState(false);

  const handleIcedClick = () => {
    setShowIced(!showIced);
    changeColumn(project.workspace_id, project.id, {
      expandIced: !showIced,
    });
  };
  const handleAcceptedClick = () => {
    setShowAccepted(!showAccepted);
    changeColumn(project.workspace_id, project.id, {
      expandAccepted: !showAccepted,
    });
  };

  const openSettingsSheet = () => {
    sheet(<ProjectSettings sheet />, {
      className: 'sm:max-w-[64rem]',
      title: t('common:project_settings'),
      text: t('common:project_settings.text'),
      id: 'edit-project',
    });
  };

  const handleTaskFormClick = () => {
    if (!createForm) {
      const container = document.getElementById(`${project.id}-viewport`);
      container?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setCreateForm(!createForm);
  };

  // const createTask = () => {
  //   dialog(<CreateTaskForm project={project} dialog />, {
  //     className: 'md:max-w-xl',
  //     title: t('common:create_task'),
  //   });
  // };

  // const onDelete = () => {
  //   db.projects.delete({ where: { id: project.id } });
  // };

  const variants = cva('h-full rounded-b-none max-w-full bg-transparent flex flex-col flex-shrink-0 snap-center', {
    variants: {
      dragging: {
        default: 'border-2 border-transparent',
        over: 'ring-2 opacity-30',
        overlay: 'ring-2 ring-primary',
      },
    },
  });

  return (
    <Card
      className={variants({dragging: undefined})}
    >
      <BoardColumnHeader createFormClick={handleTaskFormClick} openSettings={openSettingsSheet} createFormOpen={createForm} />

      {createForm && <CreateTaskForm onCloseForm={() => setCreateForm(false)} />}

      <div ref={containerRef} />

      {!!tasks.length && (
        <ScrollArea id={project.id} size="indicatorVertical" className="mx-[-1px]">
          <ScrollBar size="indicatorVertical" />
          <CardContent className="flex flex-grow flex-col p-0 group/column">
            <Button
              onClick={handleAcceptedClick}
              variant="ghost"
              disabled={!acceptedCount}
              size="sm"
              className="flex justify-start w-full rounded-none gap-1 border-b border-b-green-500/10 ring-inset bg-green-500/5 hover:bg-green-500/10 text-green-500 text-sm -mt-[1px]"
            >
              <span className="text-xs">
                {acceptedCount} {t('common:accepted').toLowerCase()}
              </span>
              {!!acceptedCount && <ChevronDown size={16} className={`transition-transform opacity-50 ${showAccepted ? 'rotate-180' : 'rotate-0'}`} />}
            </Button>

            {tasks
              .filter((t) => {
                if (showAccepted && t.status === 6) return true;
                if (showIced && t.status === 0) return true;
                return t.status !== 0 && t.status !== 6;
              })
              .map((task) => (
                <TaskCard task={task} key={task.id} />
              ))}
            <Button
              onClick={handleIcedClick}
              variant="ghost"
              disabled={!icedCount}
              size="sm"
              className="flex justify-start w-full rounded-none gap-1 ring-inset text-sky-500 bg-sky-500/5 hover:bg-sky-500/10 text-sm -mt-[1px]"
            >
              <span className="text-xs">
                {icedCount} {t('common:iced').toLowerCase()}
              </span>
              {!!icedCount && <ChevronDown size={16} className={`transition-transform opacity-50 ${showIced ? 'rotate-180' : 'rotate-0'}`} />}
            </Button>
          </CardContent>
        </ScrollArea>
      )}
    </Card>
  );
}