import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { stepUpConfirmedRouteSearchParamsSchema } from '~/modules/auth/search-params-schemas';
import { StepUpConfirmedPage } from '~/modules/auth/step-up-confirmed-page';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/step-up-confirmed')({
  validateSearch: stepUpConfirmedRouteSearchParamsSchema,
  staticData: { isAuth: false },
  head: () => pageHead(i18n.t('c:step_up_confirmed')),
  component: StepUpConfirmedPage,
});
