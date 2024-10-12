import { Construction } from 'lucide-react';
import DisplayOptions from '~/modules/app/board-header/display-options';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { FocusView } from '~/modules/common/focus-view';
import StickyBox from '~/modules/common/sticky-box';
import { useWorkspaceQuery } from './helpers/use-workspace';

const WorkspaceOverview = () => {
  const {
    data: { workspace },
  } = useWorkspaceQuery();

  return (
    <>
      <StickyBox enabled className="flex items-center justify-between gap-2 z-[60] bg-background p-2 -m-2 md:p-3 md:-m-3">
        <AvatarWrap type="workspace" id={workspace.id} name={workspace.name} url={workspace.thumbnailUrl} />

        <div className="inline-flex gap-2">
          <DisplayOptions className="max-sm:hidden" />
          <FocusView iconOnly />
        </div>
      </StickyBox>
      <div className="text-sm text-center mt-12">
        <ContentPlaceholder
          Icon={Construction}
          title="Not built yet."
          text={<p>Here will be a grid of project cards for stats, analytics and advisory.</p>}
        />
      </div>
    </>
  );
};

export default WorkspaceOverview;
