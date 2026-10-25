import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { ContactPage } from '~/modules/marketing/contact-page';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/_marketing/contact')({
  staticData: { isAuth: false },
  head: () => pageHead(i18n.t('c:contact')),
  component: ContactPage,
});
