import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { createReactBlockSpec } from '@blocknote/react';
import i18n from 'i18next';
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
    const { icon: Icon } = notifyOptions.find((option) => option.value === block.props.type) ?? notifyOptions[0];
    return (
      <div className="notify" data-notify-type={block.props.type}>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger disabled={!editor.isEditable}>
            <div className="notify-icon-wrapper" contentEditable={false}>
              <Icon className={cn('notify-icon size-4.5', !editor.isEditable && 'cursor-default')} data-notify-icon-type={block.props.type} />
            </div>
          </DropdownMenuTrigger>

          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel>{i18n.t('c:notify_type')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifyOptions.map(({ icon: OptionIcon, titleKey, value }) => (
                <DropdownMenuItem
                  key={value}
                  className="min-h-8 p-1"
                  onClick={() => editor.updateBlock(block, { type: 'notify', props: { type: value } })}
                >
                  <OptionIcon className="notify-icon" data-notify-icon-type={value} />
                  {i18n.t(titleKey)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="inline-content" ref={contentRef} />
      </div>
    );
  },
});

export const getNotifySlashItem = (editor: CustomBlockNoteEditor) => ({
  title: i18n.t('c:notify'),
  key: 'notify',
  onItemClick: () => {
    insertOrUpdateBlockForSlashMenu(editor, { type: 'notify' });
  },
  aliases: ['notify', 'notification', 'emphasize', 'warning', 'error', 'info', 'success'],
  icon: <MessageCircleIcon />,
});
