import { defaultProps, filterSuggestionItems, insertOrUpdateBlock } from '@blocknote/core';
import { createReactBlockSpec, getDefaultReactSlashMenuItems } from '@blocknote/react';

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
import type { CustomBlockNoteSchema } from '~/modules/common/blocknote/types';

// The Notify block.
export const Notify = createReactBlockSpec(
  {
    type: 'notify',
    propSchema: {
      textAlignment: defaultProps.textAlignment,
      textColor: defaultProps.textColor,
      type: {
        default: 'warning',
        // must match notifyTypes in ./notifyOptions
        values: ['warning', 'error', 'info', 'success'],
      },
    },
    content: 'inline',
  },
  {
    render: (props) => {
      const [open, setOpen] = useState(false);
      const [notifyType] = notifyTypes.filter((a) => a.value === props.block.props.type);
      const Icon = notifyType.icon;
      return (
        <div className={'notify'} data-notify-type={props.block.props.type}>
          {/*Icon which opens a menu to choose the Alert type*/}
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger>
              <div className={'notify-icon-wrapper'} contentEditable={false}>
                <Icon className={'notify-icon'} data-notify-icon-type={props.block.props.type} size={32} />
              </div>
              <DropdownMenuContent>
                <DropdownMenuLabel>Notify Type</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifyTypes.map((type) => {
                  const ItemIcon = type.icon;
                  return (
                    <DropdownMenuItem
                      key={type.value}
                      className="flex flex-row gap-2 p-1 min-h-8"
                      onClick={() =>
                        props.editor.updateBlock(props.block, {
                          type: 'notify',
                          props: { type: type.value },
                        })
                      }
                    >
                      {<ItemIcon className={'notify-icon'} size={16} data-notify-icon-type={type.value} />}
                      <span className="text-sm">{type.title}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenuTrigger>
          </DropdownMenu>
          {/*Rich text field for user to type in*/}
          <div className={'inline-content'} ref={props.contentRef} />
        </div>
      );
    },
  },
);

// Slash menu item to insert an Notify block
const insertNotify = (editor: CustomBlockNoteSchema) => ({
  title: 'Notify',
  onItemClick: () => {
    insertOrUpdateBlock(editor, {
      type: 'notify',
    });
  },
  aliases: ['notify', 'notification', 'emphasize', 'warning', 'error', 'info', 'success'],
  group: 'Other',
  icon: <MessageCircle size={16} />,
});

export const getNotifyItems = async (query: string, editor: CustomBlockNoteSchema) => {
  // Gets all default slash menu items and `insertNotify` item.
  return filterSuggestionItems([...getDefaultReactSlashMenuItems(editor), insertNotify(editor)], query);
};
