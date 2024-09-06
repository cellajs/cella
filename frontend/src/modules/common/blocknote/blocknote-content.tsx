import { DragHandleButton, GridSuggestionMenuController, SideMenu, SideMenuController } from '@blocknote/react';
import { getProjectMembers } from '~/api/projects';
import { queryClient } from '~/lib/router';
import { CustomFormattingToolbar } from '~/modules/common/blocknote/custom-formatting-toolbar';
import { CustomSlashMenu } from '~/modules/common/blocknote/custom-slash-menu';
import { getMentionMenuItems, type schemaWithMentions } from '~/modules/common/blocknote/mention';

export const BlockNoteForTaskContent = ({ editor, projectId }: { editor: typeof schemaWithMentions.BlockNoteEditor; projectId: string }) => (
  <>
    <CustomSlashMenu />
    <SideMenuController
      sideMenu={(props) => (
        <SideMenu {...props}>
          <DragHandleButton dragHandleMenu={() => null} {...props} />
        </SideMenu>
      )}
    />
    <GridSuggestionMenuController
      triggerCharacter={'@'}
      getItems={async () => {
        const members = await queryClient.ensureQueryData({
          queryKey: ['projects', projectId, 'members'],
          queryFn: () => getProjectMembers(projectId),
          staleTime: 1000 * 60 * 1, // 1 minute
        });
        return getMentionMenuItems(members, editor).map((item) => ({
          ...item,
          title: item.id,
        }));
      }}
      columns={2}
      minQueryLength={0}
    />
    <GridSuggestionMenuController
      triggerCharacter={':'}
      // Changes the Emoji Picker to only have 10 columns & min length of 0.
      columns={10}
      minQueryLength={0}
    />
    <CustomFormattingToolbar />
  </>
);
