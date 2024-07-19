import { useTranslation } from 'react-i18next';
import TableCount from '~/modules/common/data-table/table-count';
import { FocusView } from '~/modules/common/focus-view';
import StickyBox from '~/modules/common/sticky-box';
import DisplayOptions from '~/modules/projects/board/header/display-options';
import { useWorkspaceStore } from '~/store/workspace';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { TooltipButton } from '~/modules/common/tooltip-button';
import TaskSelectedTableButtons from '~/modules/projects/board/header/selected-buttons';

const TableHeader = ({
  totalCount,
  children,
}: {
  totalCount: number;
  children?: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const { workspace, selectedTasks, searchQuery, setSearchQuery } = useWorkspaceStore();

  return (
    <StickyBox enabled className="flex items-center max-sm:justify-between gap-2 z-[60] bg-background p-2 -m-2 md:p-3 md:-m-3">
      {!selectedTasks.length && (
        <div className="flex gap-2">
          {!searchQuery.length && (
            <TooltipButton toolTipContent={t('common:page_view')}>
              <AvatarWrap className="cursor-pointer" type="workspace" id={workspace.id} name={workspace.name} url={workspace.thumbnailUrl} />
            </TooltipButton>
          )}
          <TableCount count={totalCount} type="task" isFiltered={!!searchQuery} onResetFilters={() => setSearchQuery('')} />
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
