import { useRouterState } from '@tanstack/react-router';
import KanbanBoard from '~/modules/projects/kanban-board';
import KanbanHeader from '~/modules/projects/kanban-header';

const Projects = () => {
  const path = useRouterState().location.pathname;
  return (
    <div className="flex flex-col gap-2 p-2 md:p-4">
      <KanbanHeader />
      <KanbanBoard key={path} />
    </div>
  );
};

export default Projects;
