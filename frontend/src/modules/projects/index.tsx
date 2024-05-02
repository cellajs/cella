import router from '~/lib/router';
import Board from '~/modules/projects/board';
import BoardHeader from '~/modules/projects/board-header';
import Table from './table';
import { type Dispatch, type SetStateAction, createContext, useState } from 'react';

interface ProjectsContextValue {
  displayMode: 'board' | 'list';
  setDisplayMode: (mode: 'board' | 'list') => void;
  selectedTasks: string[];
  setSelectedTasks: Dispatch<SetStateAction<string[]>>;
}

export const ProjectsContext = createContext({} as ProjectsContextValue);

const Projects = () => {
  const { state } = router.state.location;
  const [displayMode, setDisplayMode] = useState<'board' | 'list'>('board');
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);

  return (
    <ProjectsContext.Provider value={{ displayMode, setDisplayMode, selectedTasks, setSelectedTasks }}>
      <div className="flex flex-col gap-2 p-2 md:p-4 md:gap-4">
        <BoardHeader />
        {displayMode === 'board' ? <Board key={state.key} /> : <Table />}
      </div>
    </ProjectsContext.Provider>
  );
};

export default Projects;
