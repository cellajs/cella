import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { z } from 'zod';
import { SignOutPage } from '~/modules/auth/sign-out-page';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/sign-out')({
  validateSearch: z.object({ force: z.boolean().optional() }),
  staticData: { isAuth: false },
  head: () => pageHead(i18n.t('c:sign_out')),
  component: SignOutPage,
});
