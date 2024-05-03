import router from '~/lib/router';
import Board from '~/modules/projects/board';
import BoardHeader from '~/modules/projects/board-header';
import Table from './table';
import { type Dispatch, type SetStateAction, createContext, useState, useContext } from 'react';
import { PageHeader } from '../common/page-header';
import { WorkspaceContext } from '../workspaces';
import { useNavigationStore } from '~/store/navigation';

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
  const { setFocusView } = useNavigationStore();
  const { workspace } = useContext(WorkspaceContext);

  const [displayMode, setDisplayMode] = useState<'board' | 'list'>('board');
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPageHeader, setShowPageHeader] = useState(false);

  const togglePageHeader = () => {
    if (!showPageHeader) setFocusView(false);
    setShowPageHeader(!showPageHeader);
  };

  return (
    <ProjectsContext.Provider value={{ displayMode, setDisplayMode, selectedTasks, setSelectedTasks, searchQuery, setSearchQuery }}>
      {showPageHeader && (
        <PageHeader type="WORKSPACE" id={workspace.id} title={workspace.name} thumbnailUrl={workspace.thumbnailUrl} bannerUrl={workspace.bannerUrl} />
      )}

      <div className="flex flex-col gap-2 md:gap-4 p-2 md:p-4">
        <BoardHeader showPageHeader={showPageHeader} handleShowPageHeader={togglePageHeader} />
        {displayMode === 'board' ? <Board key={state.key} /> : <Table />}
      </div>
    </ProjectsContext.Provider>
  );
};

export default Projects;
