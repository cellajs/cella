import { createFileRoute } from '@tanstack/react-router';
import { AboutPage } from '~/modules/marketing/about/about-page';
import { appTitle } from '~/utils/app-title';

export const Route = createFileRoute('/_public/_marketing/about')({
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('About') }] }),
  component: AboutPage,
});
