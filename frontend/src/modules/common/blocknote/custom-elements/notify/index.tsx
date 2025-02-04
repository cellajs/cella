import { defaultProps, insertOrUpdateBlock } from '@blocknote/core';
import { type BlockTypeSelectItem, createReactBlockSpec } from '@blocknote/react';

import { MessageCircle } from 'lucide-react';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/modules/ui/dropdown-menu';

import { notifyTypes } from '~/modules/common/blocknote/custom-elements/notify/notify-options';
import type { CustomBlockNoteSchema, IconType } from '~/modules/common/blocknote/types';

// The Notify block.
export const Notify = createReactBlockSpec(
  {
    type: 'notify',
    propSchema: {
      textAlignment: defaultProps.textAlignment,
      textColor: defaultProps.textColor,
      type: {
        default: 'warning',
        // must match notifyTypes in ~/modules/common/blocknote/notifyOptions
        values: ['warning', 'error', 'info', 'success'],
      },
    },
    content: 'inline',
  },
  {
    render: ({ block, editor, contentRef }) => {
      const [open, setOpen] = useState(false);
      const [notifyType] = notifyTypes.filter((a) => a.value === block.props.type);
      const Icon = notifyType.icon;
      return (
        <div className={'notify'} data-notify-type={block.props.type}>
          {/*Icon which opens a menu to choose the Alert type*/}
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger>
              <div className={'notify-icon-wrapper'} contentEditable={false}>
                <Icon className={'notify-icon'} data-notify-icon-type={block.props.type} size={32} />
              </div>
              <DropdownMenuContent>
                <DropdownMenuLabel>Notify Type</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifyTypes.map(({ icon: Icon, title, value }) => {
                  return (
                    <DropdownMenuItem
                      key={value}
                      className="flex flex-row gap-2 p-1 min-h-8"
                      onClick={() =>
                        editor.updateBlock(block, {
                          type: 'notify',
                          props: { type: value },
                        })
                      }
                    >
                      {<Icon className={'notify-icon'} size={16} data-notify-icon-type={value} />}
                      <span className="text-sm">{title}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenuTrigger>
          </DropdownMenu>
          {/*Rich text field for user to type in*/}
          <div className={'inline-content'} ref={contentRef} />
        </div>
      );
    },
  },
);

// Slash menu item to insert an Notify block
// add key on custom slash items it check allowance by it
export const insertSlashNotifyItem = (editor: CustomBlockNoteSchema) => ({
  title: 'Notify',
  key: 'notify',
  onItemClick: () => {
    insertOrUpdateBlock(editor, {
      type: 'notify',
    });
  },
  aliases: ['notify', 'notification', 'emphasize', 'warning', 'error', 'info', 'success'],
  group: 'Custom',
  icon: <MessageCircle size={16} />,
});

// Side menu item to insert Notify block
export const insertSideNotifyItem = (): BlockTypeSelectItem & { oneInstanceOnly?: boolean } => ({
  name: 'Notify',
  type: 'notify',
  isSelected: (block: { type: string }) => block.type === 'notify',
  icon: MessageCircle as IconType,
});

export const getSlashNotifySlashItem = (editor: CustomBlockNoteSchema) => {
  // Gets all default slash menu items and `insertNotify` item.
  return insertSlashNotifyItem(editor);
};
