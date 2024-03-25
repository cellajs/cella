import { Suspense, lazy } from 'react';

const KanbanBoard = lazy(() => import('./kanban-board'));

const Projects = () => {
  return (
    <Suspense>
      <KanbanBoard />
    </Suspense>
  );
};

export default Projects;
