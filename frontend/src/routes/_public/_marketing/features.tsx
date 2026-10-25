import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { FeaturesPage } from '~/modules/marketing/features-page';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/_marketing/features')({
  staticData: { isAuth: false },
  head: () => pageHead(i18n.t('c:features')),
  component: FeaturesPage,
});
