import { t } from 'i18next';
import { SheetTabs } from '~/modules/common/sheet-tabs';
import { sheet } from '~/modules/common/sheeter/state';
import { MessageDraft } from '~/modules/requests/message-draft';
import MessageForm from '~/modules/requests/message-form';

export const openMessageSheet = (emails: string[], callback: () => void) => {
  const messageTabs = [
    {
      id: 'write',
      label: 'common:write',
      element: <MessageForm sheet emails={emails} dropSelected={callback} />,
    },

    {
      id: 'draft',
      label: 'common:draft',
      element: <MessageDraft />,
    },
  ];
  sheet.create(<SheetTabs tabs={messageTabs} />, {
    className: 'max-w-full lg:max-w-4xl',
    title: t('common:request_message'),
    description: t('common:request_message.text'),
    id: 'message-form',
    scrollableOverlay: true,
    side: 'right',
  });
};
