import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defaultLegalSubject, legalSubjects } from '~/modules/marketing/legal/legal-config';
import { LegalPage } from '~/modules/marketing/legal/legal-page';
import appTitle from '~/utils/app-title';

/**
 * Legal pages displaying privacy policy, terms, and other legal content.
 */
export const Route = createFileRoute('/_public/legal/$subject')({
  params: {
    parse: (params) => ({
      subject: z.enum(legalSubjects).catch(defaultLegalSubject).parse(params.subject),
    }),
    stringify: (params) => ({ subject: params.subject }),
  },
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Legal') }] }),
  component: LegalPage,
});
