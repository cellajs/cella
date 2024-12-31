import { t } from 'i18next';
import { SheetTabs } from '~/modules/common/sheet-tabs';
import { sheet } from '~/modules/common/sheeter/state';
import { FeedbackLetterDraft } from '~/modules/requests/feedback-letter-draft';
import FeedbackLetterForm from '~/modules/requests/feedback-letter-form';

export const openFeedbackLetterSheet = (emails: string[], callback: () => void) => {
  const feedbackLetterTabs = [
    {
      id: 'write',
      label: 'common:write',
      element: <FeedbackLetterForm sheet emails={emails} dropSelected={callback} />,
    },

    {
      id: 'draft',
      label: 'common:draft',
      element: <FeedbackLetterDraft />,
    },
  ];
  sheet.create(<SheetTabs tabs={feedbackLetterTabs} />, {
    className: 'max-w-full lg:max-w-4xl',
    title: t('common:feedback_letter'),
    description: t('common:feedback_letter.text'),
    id: 'feedback-letter-form',
    scrollableOverlay: true,
    side: 'right',
  });
};
