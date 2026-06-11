import { createFileRoute } from '@tanstack/react-router';
import { AboutPage } from '~/modules/marketing/about/about-page';
import appTitle from '~/utils/app-title';

/**
 * Public about page describing the application.
 */
export const Route = createFileRoute('/_public/about')({
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('About') }] }),
  component: AboutPage,
});
