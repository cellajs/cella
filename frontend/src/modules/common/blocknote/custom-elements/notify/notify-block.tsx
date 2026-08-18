import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { type BlockTypeSelectItem, createReactBlockSpec } from '@blocknote/react';
import { MessageCircleIcon } from 'lucide-react';
import { useState } from 'react';
import { notifyConfig } from 'shared/utils/blocknote-schema-configs';
import { notifyTypes } from '~/modules/common/blocknote/custom-elements/notify/notify-options';
import type { CustomBlockNoteEditor, IconType } from '~/modules/common/blocknote/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/modules/ui/dropdown-menu';

export const notifyBlock = createReactBlockSpec(notifyConfig, {
  render: ({ block, editor, contentRef }) => {
    const [open, setOpen] = useState(false);
    const notifyType = notifyTypes.find((a) => a.value === block.props.type)!;
    const Icon = notifyType.icon;
    return (
      <div className={'notify'} data-notify-type={block.props.type}>
        <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger disabled={!editor.isEditable}>
            <div className={'notify-icon-wrapper'} contentEditable={false}>
              <Icon
                className={`notify-icon size-8 ${!editor.isEditable && 'cursor-default'}`}
                data-notify-icon-type={block.props.type}
              />
            </div>
          </DropdownMenuTrigger>

          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Notify Type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifyTypes.map(({ icon: Icon, title, value }) => {
                return (
                  <DropdownMenuItem
                    key={value}
                    className="flex min-h-8 flex-row gap-2 p-1"
                    onClick={() => editor.updateBlock(block, { type: 'notify', props: { type: value } })}
                  >
                    {<Icon className={'notify-icon'} data-notify-icon-type={value} />}
                    <span className="text-sm">{title}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className={'inline-content'} ref={contentRef} />
      </div>
    );
  },
});

const insertSlashNotifyItem = (editor: CustomBlockNoteEditor) => ({
  title: 'Notify',
  key: 'notify',
  onItemClick: () => {
    insertOrUpdateBlockForSlashMenu(editor, {
      type: 'notify',
    });
  },
  aliases: ['notify', 'notification', 'emphasize', 'warning', 'error', 'info', 'success'],
  group: 'Custom',
  icon: <MessageCircleIcon />,
});

export const insertSideNotifyItem = (): BlockTypeSelectItem & { oneInstanceOnly?: boolean } => ({
  name: 'Notify',
  type: 'notify',
  icon: MessageCircleIcon as IconType,
});

export const getSlashNotifySlashItem = (editor: CustomBlockNoteEditor) => insertSlashNotifyItem(editor);
