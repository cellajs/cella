import KanbanBoard from '~/modules/projects/kanban-board';
import KanbanHeader from '~/modules/projects/kanban-header';

const Projects = () => {
  return (
    <div className="flex flex-col gap-2 p-2 md:p-4">
      <KanbanHeader />
      <KanbanBoard />
    </div>
  );
};

export default Projects;
