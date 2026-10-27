import { countryName } from '#/lib/geoip';
import type { RequestDetails } from '#/lib/request-details';
import { i18n, plainText } from './i18n';
import type { EmailTemplateDef } from './types';

/** One row of the request details: a label and its value, both plain text. */
export interface RequestDetailRow {
  label: string;
  value: string;
}

/** What the mailer adds around every template's content. */
export interface EmailFrame {
  /** Rows at the end of the body panel; set only for a template that declares them and a send inside a request. */
  requestDetails?: RequestDetailRow[];
}

const mailTimeFormat = (lng: string) =>
  new Intl.DateTimeFormat(lng, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });

/** A moment for a mail reader in `lng`, always in UTC: no user row stores a timezone. "October 27, 2026 at 09:30 UTC". */
export const formatMailTime = (iso: string, lng: string) => mailTimeFormat(lng).format(new Date(iso));

/** The request details as rows in `lng`. A row whose value is unknown is left out; the time is always known. */
const requestDetailRows = (lng: string, { at, country, browser, os }: RequestDetails): RequestDetailRow[] => {
  const t = (key: string, values: Record<string, string> = {}) => i18n.t(`backend:email.request_details.${key}`, { lng, ...values, ...plainText });

  const rows: RequestDetailRow[] = [];
  if (country) rows.push({ label: t('country'), value: t('country_value', { country: countryName(country, lng) }) });
  const device = browser && os ? t('browser_value', { browser, os }) : (browser ?? os);
  if (device) rows.push({ label: t('browser'), value: device });
  rows.push({ label: t('time'), value: formatMailTime(at, lng) });
  return rows;
};

/**
 * The frame of one send in `lng`. Request details only when the template declares them for these statics and the send
 * runs inside a request: a mail about what another person did never shows that person's whereabouts.
 */
export function emailFrame<TStatic>(
  template: Pick<EmailTemplateDef<TStatic>, 'requestDetails'>,
  statics: TStatic,
  lng: string,
  details: RequestDetails | null,
): EmailFrame {
  const declared = typeof template.requestDetails === 'function' ? template.requestDetails(statics) : template.requestDetails === true;
  return { requestDetails: details && declared ? requestDetailRows(lng, details) : undefined };
}
