import type { WebSocketStatus } from '@hocuspocus/provider';
// import { Icon } from '../../../components/ui/Icon';
// import { Toolbar } from '../../../components/ui/Toolbar';
import type { EditorUser } from '../types';
import { EditorInfo } from './EditorInfo';

export type EditorHeaderProps = {
  isSidebarOpen?: boolean;
  toggleSidebar?: () => void;
  characters: number;
  words: number;
  collabState: WebSocketStatus;
  users: EditorUser[];
};

export const EditorHeader = ({ characters, collabState, users, words }: EditorHeaderProps) => {
  return (
    <div className="flex flex-row">
      {/* <div className="flex flex-row gap-x-1.5 items-center">
        <div className="flex items-center gap-x-1.5">
          <Toolbar.Button
            tooltip={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            onClick={toggleSidebar}
            active={isSidebarOpen}
            className={isSidebarOpen ? 'bg-transparent' : ''}
          >
            <Icon name={isSidebarOpen ? 'PanelLeftClose' : 'PanelLeft'} />
          </Toolbar.Button>
        </div>
      </div> */}
      <EditorInfo characters={characters} words={words} collabState={collabState} users={users} />
    </div>
  );
};
