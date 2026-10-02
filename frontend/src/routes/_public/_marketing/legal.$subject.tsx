import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { z } from 'zod';
import { defaultLegalSubject, legalConfig, legalSubjects } from '~/modules/auth/legal/legal-config';
import { LegalPage } from '~/modules/marketing/legal/legal-page';
import { appTitle } from '~/utils/app-title';

export const Route = createFileRoute('/_public/_marketing/legal/$subject')({
  params: {
    parse: (params) => ({ subject: z.enum(legalSubjects).catch(defaultLegalSubject).parse(params.subject) }),
    stringify: (params) => ({ subject: params.subject }),
  },
  staticData: { isAuth: false },
  head: ({ params }) => ({ meta: [{ title: appTitle(i18n.t(legalConfig[params.subject].label)) }] }),
  component: LegalPage,
});
