import { createFileRoute } from '@tanstack/react-router';
import { ContactPage } from '~/modules/marketing/contact-page';
import { appTitle } from '~/utils/app-title';

/**
 * Contact page for user inquiries and support.
 */
export const Route = createFileRoute('/_public/_marketing/contact')({
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Contact') }] }),
  component: ContactPage,
});
