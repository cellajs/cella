import router from '~/lib/router';
import KanbanBoard from '~/modules/projects/kanban-board';
import KanbanHeader from '~/modules/projects/kanban-header';

const Projects = () => {
  const { state } = router.state.location;
  return (
    <div className="flex flex-col gap-2 p-2 md:p-4">
      <KanbanHeader />
      <KanbanBoard key={state.key} />
    </div>
  );
};

export default Projects;
