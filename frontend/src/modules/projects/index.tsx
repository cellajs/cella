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
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
}

export const ProjectsContext = createContext({} as ProjectsContextValue);

const Projects = () => {
  const { state } = router.state.location;
  const [displayMode, setDisplayMode] = useState<'board' | 'list'>('board');
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <ProjectsContext.Provider value={{ displayMode, setDisplayMode, selectedTasks, setSelectedTasks, searchQuery, setSearchQuery }}>
      <div className="flex flex-col gap-2 md:gap-4">
        <BoardHeader />
        <div className="p-2 md:p-4">{displayMode === 'board' ? <Board key={state.key} /> : <Table />}</div>
      </div>
    </ProjectsContext.Provider>
  );
};

export default Projects;
