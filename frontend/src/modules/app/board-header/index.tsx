import { useState } from 'react';
import { FocusView } from '~/modules/common/focus-view';

import DisplayOptions from '~/modules/app/board-header/display-options';
import PageView from '~/modules/app/board-header/page-view';
import TasksSearch from '~/modules/app/board-header/search';
import TaskSelectedButtons from '~/modules/app/board-header/selected-buttons';
import { useWorkspaceQuery } from '~/modules/workspaces/helpers/use-workspace';
import { useNavigationStore } from '~/store/navigation';
import { useWorkspaceStore } from '~/store/workspace';

const BoardHeader = ({
  children,
}: {
  children?: React.ReactNode;
}) => {
  const { setFocusView } = useNavigationStore();
  const { selectedTasks, setSelectedTasks, showPageHeader, togglePageHeader } = useWorkspaceStore();
  const {
    data: { workspace },
  } = useWorkspaceQuery();

  const [searchFocused, setSearchFocused] = useState(false);

  const handleTogglePageHeader = () => {
    setFocusView(false);
    togglePageHeader();
  };

  return (
    <div className="flex items-center max-sm:justify-between gap-2 z-[60] bg-background p-2 -m-2 md:p-3 md:-m-3">
      {!searchFocused && !selectedTasks.length && (
        <PageView workspace={workspace} showPageHeader={showPageHeader} toggleFocus={handleTogglePageHeader} />
      )}
      {!!selectedTasks.length && <TaskSelectedButtons workspace={workspace} selectedTasks={selectedTasks} setSelectedTasks={setSelectedTasks} />}
      <TasksSearch toggleFocus={() => setSearchFocused(!searchFocused)} />
      {!searchFocused && children}
      <DisplayOptions className="max-sm:hidden" />
      <FocusView iconOnly />
    </div>
  );
};

export default BoardHeader;
