import { WebSocketStatus } from '@hocuspocus/provider';
import { memo } from 'react';
import { cn } from '~/lib/utils';
import { getConnectionText } from '../../../lib/utils/getConnectionText';
import Tooltip from '../../ui/Tooltip';
import { EditorUser } from '../types';

export type EditorInfoProps = {
  characters: number;
  words: number;
  collabState: WebSocketStatus;
  users: EditorUser[];
};

export const EditorInfo = memo(({ characters, collabState, users, words }: EditorInfoProps) => {
  return (
    <div className="flex items-center">
      <div className="flex flex-col justify-center pr-4 mr-4 text-right">
        <div className="text-xs font-semibold opacity-50">
          {words} / {characters}
        </div>
      </div>
      <div className="flex items-center gap-2 mr-2">
        <div
          className={cn('w-2 h-2 rounded-full', {
            'bg-yellow-500 dark:bg-yellow-400': collabState === 'connecting',
            'bg-green-500 dark:bg-green-400': collabState === 'connected',
            'bg-red-500 dark:bg-red-400': collabState === 'disconnected',
          })}
        />
        <span className="max-w-[4rem] text-xs font-semibold">{getConnectionText(collabState)}</span>
      </div>
      {collabState === 'connected' && (
        <div className="flex flex-row items-center">
          <div className="relative flex flex-row items-center ml-3">
            {users.map((user: EditorUser) => (
              <div key={user.clientId} className="-ml-3">
                <Tooltip title={user.name}>
                  <img
                    className="w-8 h-8 border border-white rounded-full dark:border-black"
                    src={`https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${user.name}&backgroundColor=${user.color.replace('#', '')}`}
                    alt="avatar"
                  />
                </Tooltip>
              </div>
            ))}
            {users.length > 3 && (
              <div className="-ml-3">
                <div className="flex items-center justify-center w-8 h-8 font-bold text-xs leading-none border border-white dark:border-black bg-[#FFA2A2] rounded-full">
                  +{users.length - 3}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

EditorInfo.displayName = 'EditorInfo';
