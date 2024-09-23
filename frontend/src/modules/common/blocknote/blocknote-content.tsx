import { DragHandleButton, GridSuggestionMenuController, SideMenu, SideMenuController } from '@blocknote/react';
import { CustomFormattingToolbar } from '~/modules/common/blocknote/custom-formatting-toolbar';
import { CustomSlashMenu } from '~/modules/common/blocknote/custom-slash-menu';
import { getMentionMenuItems, type schemaWithMentions } from '~/modules/common/blocknote/mention';
import type { Member } from '~/types/common';

export const BlockNoteForTaskContent = ({
  editor,
  members,
  subTask = false,
}: { editor: typeof schemaWithMentions.BlockNoteEditor; members: Member[]; subTask?: boolean }) => (
  <>
    <CustomSlashMenu />
    {!subTask && (
      <SideMenuController
        sideMenu={(props) => (
          <SideMenu {...props}>
            <DragHandleButton dragHandleMenu={() => null} {...props} />
          </SideMenu>
        )}
      />
    )}
    <GridSuggestionMenuController
      triggerCharacter={'@'}
      getItems={async () =>
        getMentionMenuItems(members, editor).map((item) => ({
          ...item,
          title: item.id,
        }))
      }
      columns={2}
      minQueryLength={0}
    />
    <GridSuggestionMenuController
      triggerCharacter={':'}
      // Changes the Emoji Picker to only have 10 columns & min length of 0.
      columns={10}
      minQueryLength={0}
    />
    <div className="fixed  z-[99999]">
      <CustomFormattingToolbar />
    </div>
  </>
);
