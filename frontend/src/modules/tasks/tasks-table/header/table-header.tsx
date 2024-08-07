import TableCount from '~/modules/common/data-table/table-count';
import { FocusView } from '~/modules/common/focus-view';
import StickyBox from '~/modules/common/sticky-box';
import DisplayOptions from '~/modules/projects/board/header/display-options';
import { useWorkspaceStore } from '~/store/workspace';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import TaskSelectedTableButtons from '~/modules/projects/board/header/selected-buttons';

const TableHeader = ({
  totalCount,
  children,
  isFiltered,
  onResetFilters,
}: {
  totalCount: number;
  isFiltered: boolean;
  children?: React.ReactNode;
  onResetFilters?: () => void;
}) => {
  const { workspace, selectedTasks } = useWorkspaceStore();

  return (
    <StickyBox enabled className="flex items-center max-sm:justify-between gap-2 z-[60] bg-background p-2 -m-2 md:p-3 md:-m-3">
      {!selectedTasks.length && (
        <div className="flex gap-2">
          <AvatarWrap type="workspace" id={workspace.id} name={workspace.name} url={workspace.thumbnailUrl} />
          <TableCount count={totalCount} type="task" isFiltered={isFiltered} onResetFilters={() => onResetFilters?.()} />
        </div>
      )}
      {!!selectedTasks.length && <TaskSelectedTableButtons />}
      {children}
      <DisplayOptions className="max-sm:hidden" />
      <FocusView iconOnly />
    </StickyBox>
  );
};

export default TableHeader;
