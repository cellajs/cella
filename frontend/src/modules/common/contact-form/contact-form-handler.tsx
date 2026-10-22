import i18n from 'i18next';
import type { RefObject } from 'react';
import { ContactForm } from '~/modules/common/contact-form/contact-form';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';

export const contactFormHandler = (ref: RefObject<HTMLButtonElement | null>) => {
  dialoger.getState().create(<ContactForm dialog />, {
    id: 'contact-form',
    triggerRef: ref,
    drawerOnMobile: false,
    outsideScroll: true,
    className: 'sm:max-w-5xl',
    title: i18n.t('c:contact_us'),
    titleContent: <UnsavedBadge title={i18n.t('c:contact_us')} />,
    description: i18n.t('c:contact_us.text'),
  });
};
