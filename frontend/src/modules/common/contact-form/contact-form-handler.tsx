import i18n from 'i18next';
import { ContactForm, contactFormDialogId } from '~/modules/common/contact-form/contact-form';
import { dialoger, type TriggerRef } from '~/modules/common/dialoger/use-dialoger';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';

export const contactFormHandler = (ref: TriggerRef) => {
  const title = i18n.t('c:contact_us');
  dialoger.getState().create(<ContactForm dialog />, {
    id: contactFormDialogId,
    triggerRef: ref,
    drawerOnMobile: false,
    outsideScroll: true,
    className: 'sm:max-w-5xl',
    title,
    titleContent: <UnsavedBadge title={title} />,
    description: i18n.t('c:contact_us.text'),
  });
};
