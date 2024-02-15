import { WebSocketStatus } from '@hocuspocus/provider';
// import { Icon } from '../../../components/ui/Icon';
// import { Toolbar } from '../../../components/ui/Toolbar';
import { EditorUser } from '../types';
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
    <div className="flex flex-row items-center justify-between flex-none py-2 pl-6 pr-3 text-black bg-white border-b border-neutral-200 dark:bg-black dark:text-white dark:border-neutral-800">
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
