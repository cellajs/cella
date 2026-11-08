import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { createReactBlockSpec } from '@blocknote/react';
import i18n from 'i18next';
import { CircleAlertIcon, CircleCheckIcon, CircleXIcon, InfoIcon, MessageCircleIcon } from 'lucide-react';
import { typedEntries } from 'shared';
import { type NotifyType, notifyConfig } from 'shared/utils/blocknote-schema-configs';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';
import type { IconComponent } from '~/modules/common/icons/types';
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

/** In menu order. */
const notifyOptions = {
  warning: { titleKey: 'c:warning', icon: CircleAlertIcon },
  error: { titleKey: 'c:error', icon: CircleXIcon },
  info: { titleKey: 'c:info', icon: InfoIcon },
  success: { titleKey: 'c:success', icon: CircleCheckIcon },
} as const satisfies Record<NotifyType, { titleKey: string; icon: IconComponent }>;

export const notifyBlock = createReactBlockSpec(notifyConfig, {
  render: ({ block, editor, contentRef }) => {
    // A stored value outside the four renders as a warning.
    const { icon: Icon } = notifyOptions[block.props.type] ?? notifyOptions.warning;
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
              {typedEntries(notifyOptions).map(([value, { icon: OptionIcon, titleKey }]) => (
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
