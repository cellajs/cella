import { createFileRoute } from '@tanstack/react-router';
import { stepUpConfirmedRouteSearchParamsSchema } from '~/modules/auth/search-params-schemas';
import { StepUpConfirmedPage } from '~/modules/auth/step-up-confirmed-page';
import { appTitle } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/step-up-confirmed')({
  validateSearch: stepUpConfirmedRouteSearchParamsSchema,
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Confirmed') }] }),
  component: StepUpConfirmedPage,
});
