import { redirect } from '@tanstack/react-router';
import type { z } from 'zod';
import { toaster } from '~/modules/common/toaster/toaster';
import { meAuthQueryOptions } from '~/modules/me/query';
import type { accountRouteSearchParamsSchema } from '~/modules/me/search-params-schemas';
import { toastTypeBySeverity } from '~/query/on-error';
import { queryClient } from '~/query/query-client';
import { getErrorInfo } from '~/utils/get-error-info';

/** `beforeLoad` of the account page: an `error` a backend OAuth connect redirect appended is toasted, then stripped from the URL. */
export function accountBeforeLoad(search: z.output<typeof accountRouteSearchParamsSchema>): void {
  if (!search.error) return;
  const { title, message } = getErrorInfo({ errorFromQuery: search.error });
  toaster[toastTypeBySeverity[search.severity ?? 'warn']](title, { description: message || undefined });
  throw redirect({ to: '/account', search: {}, replace: true });
}

/** `loader` of the account page: the stored auth entry paints at once and revalidates behind it. */
export async function accountLoader(): Promise<void> {
  await queryClient.query({ ...meAuthQueryOptions(), staleTime: 'static' });
  void queryClient.query(meAuthQueryOptions()).catch(() => {});
}
