import i18n from 'i18next';
import type { RefObject } from 'react';
import ContactForm from '~/modules/common/contact-form/contact-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import UnsavedBadge from '~/modules/common/unsaved-badge';

/**
 * Launch contact form dialog
 */
export const contactFormHandler = (ref: RefObject<HTMLButtonElement | null>) => {
  useDialoger.getState().create(<ContactForm dialog />, {
    id: 'contact-form',
    triggerRef: ref,
    drawerOnMobile: false,
    className: 'sm:max-w-5xl',
    title: i18n.t('common:contact_us'),
    titleContent: <UnsavedBadge title={i18n.t('common:contact_us')} />,
    description: i18n.t('common:contact_us.text'),
  });
};
