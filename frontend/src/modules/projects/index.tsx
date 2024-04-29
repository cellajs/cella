import router from '~/lib/router';
import Board from '~/modules/projects/board';
import BoardHeader from '~/modules/projects/board-header';

const Projects = () => {
  const { state } = router.state.location;
  return (
    <div className="flex flex-col gap-2 p-2 md:p-4 md:gap-4">
      <BoardHeader />
      <Board key={state.key} />
    </div>
  );
};

export default Projects;
