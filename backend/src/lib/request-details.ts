import { lookupIp } from '#/lib/geoip';
import { deviceInfo } from '#/modules/auth/sessions/helpers/device-info';
import { getIp } from '#/utils/get-ip';
import { getIsoDate } from '#/utils/iso-date';
import { ambientRequest } from '#/utils/logger';

/** What a mail says about the request that caused it: one value per send, the same for every recipient. */
export interface RequestDetails {
  /** The request's `X-Request-Id`, which its log lines and its trace carry. */
  requestId: string;
  /** ISO moment of the send. */
  at: string;
  /** ISO-3166 alpha-2 code; null when GeoIP has no answer. */
  country: string | null;
  browser: string | null;
  os: string | null;
}

/** The details of the request this code runs in, or null outside one (a job, a CDC listener). Never throws. */
export const currentRequestDetails = async (): Promise<RequestDetails | null> => {
  const ctx = ambientRequest();
  if (!ctx) return null;

  const { country } = await lookupIp(getIp(ctx));
  const { browser, os } = deviceInfo(ctx);
  return { requestId: ctx.var.requestId, at: getIsoDate(), country, browser, os };
};
