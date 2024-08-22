import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { FocusView } from '~/modules/common/focus-view';
import StickyBox from '~/modules/common/sticky-box';
import DisplayOptions from '~/modules/projects/board/header/display-options';
import TaskSelectedTableButtons from '~/modules/projects/board/header/selected-buttons';
import { useWorkspaceStore } from '~/store/workspace';

const TableHeader = ({
  children,
}: {
  children?: React.ReactNode;
}) => {
  const { workspace, selectedTasks } = useWorkspaceStore();

  return (
    <StickyBox enabled className="flex items-center max-sm:justify-between gap-2 z-[60] bg-background p-2 -m-2 md:p-3 md:-m-3">
      {!selectedTasks.length && <AvatarWrap type="workspace" id={workspace.id} name={workspace.name} url={workspace.thumbnailUrl} />}
      {!!selectedTasks.length && <TaskSelectedTableButtons />}
      {children}
      <DisplayOptions className="max-sm:hidden" />
      <FocusView iconOnly />
    </StickyBox>
  );
};

export default TableHeader;
