import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { createReactBlockSpec } from '@blocknote/react';
import { MessageCircleIcon } from 'lucide-react';
import { notifyConfig } from 'shared/utils/blocknote-schema-configs';
import { notifyOptions } from '~/modules/common/blocknote/custom-elements/notify/notify-options';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/modules/ui/dropdown-menu';
import { cn } from '~/utils/cn';

export const notifyBlock = createReactBlockSpec(notifyConfig, {
  render: ({ block, editor, contentRef }) => {
    const { icon: Icon } = notifyOptions.find((option) => option.value === block.props.type)!;
    return (
      <div className={'notify'} data-notify-type={block.props.type}>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger disabled={!editor.isEditable}>
            <div className={'notify-icon-wrapper'} contentEditable={false}>
              <Icon className={cn('notify-icon size-4.5', !editor.isEditable && 'cursor-default')} data-notify-icon-type={block.props.type} />
            </div>
          </DropdownMenuTrigger>

          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Notify Type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifyOptions.map(({ icon: Icon, title, value }) => {
                return (
                  <DropdownMenuItem
                    key={value}
                    className="min-h-8 p-1"
                    onClick={() => editor.updateBlock(block, { type: 'notify', props: { type: value } })}
                  >
                    {<Icon className={'notify-icon'} data-notify-icon-type={value} />}
                    {title}
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

export const getNotifySlashItem = (editor: CustomBlockNoteEditor) => ({
  title: 'Notify',
  key: 'notify',
  onItemClick: () => {
    insertOrUpdateBlockForSlashMenu(editor, { type: 'notify' });
  },
  aliases: ['notify', 'notification', 'emphasize', 'warning', 'error', 'info', 'success'],
  group: 'Custom',
  icon: <MessageCircleIcon />,
});
