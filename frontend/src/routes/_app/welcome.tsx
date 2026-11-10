import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { withSuspense } from '~/modules/common/with-suspense';
import { welcomeBeforeLoad, welcomeLoader } from '~/modules/home/route-logic';
import { WelcomePage } from '~/modules/home/welcome-page';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_app/welcome')({
  beforeLoad: welcomeBeforeLoad,
  loader: welcomeLoader,
  head: () => pageHead(i18n.t('c:welcome')),
  component: withSuspense(WelcomePage),
});
