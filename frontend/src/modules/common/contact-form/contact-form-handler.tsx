import { i18n } from '~/lib/i18n';
import { useDialoger } from '../dialoger/use-dialoger';
import UnsavedBadge from '../unsaved-badge';
import ContactForm from './contact-form';

/**
 * Launch contact form dialog
 */
export const contactFormHandler = () => {
  useDialoger.getState().create(<ContactForm dialog />, {
    id: 'contact-form',
    drawerOnMobile: false,
    className: 'sm:max-w-5xl',
    title: i18n.t('common:contact_us'),
    titleContent: <UnsavedBadge title={i18n.t('common:contact_us')} />,
    description: i18n.t('common:contact_us.text'),
  });
};
