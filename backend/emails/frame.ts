import { appConfig } from 'shared';
import { regionName } from '#/lib/geoip';
import type { RequestDetails } from '#/lib/request-details';
import { i18n, plainText } from './i18n';
import { type EmailTemplateDef, type ParamPlaceholder, plainParam } from './types';

/** One row of the request details: a label and its value, both plain text. */
export interface RequestDetailRow {
  label: string;
  value: string;
}

/** What the mailer adds around every template's content. */
export interface EmailFrame {
  /** Rows at the end of the body panel; set only for a template that declares them and a send inside a request. */
  requestDetails?: RequestDetailRow[];
  /** "Sent to <address> by <app>", the recipient's address as the mailer's placeholder fills it per recipient. */
  sentTo?: string;
  /** The company's postal address on one line, its country named in the mail's language; unset without one in the config. */
  postalAddress?: string;
}

const postalAddress = (lng: string) => {
  const { address } = appConfig.company;
  if (!address) return undefined;
  return `${address.streetAddress}・${address.city}・${regionName(address.regionCode, lng)}, ${address.postalCode}`;
};

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

/**
 * A moment for a mail reader in `lng`, always in UTC: no user row stores a timezone. "October 27, 2026 at 09:30 UTC". A
 * value that is no date stays as it is: a mail never fails on one detail.
 */
export const formatMailTime = (iso: string, lng: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : mailTimeFormat(lng).format(date);
};

/** The request details as rows in `lng`. A row whose value is unknown is left out; the time is always known and comes last. */
const requestDetailRows = (lng: string, { at, regionCode, browser, os }: RequestDetails): RequestDetailRow[] => {
  const t = (key: 'browser' | 'browser_value' | 'country' | 'country_value' | 'time', values: Record<string, string> = {}) =>
    i18n.t(`backend:email.request_details.${key}`, { lng, ...values, ...plainText });

  const rows: RequestDetailRow[] = [];
  if (regionCode) rows.push({ label: t('country'), value: t('country_value', { country: regionName(regionCode, lng) }) });
  const device = browser && os ? t('browser_value', { browser, os }) : (browser ?? os);
  if (device) rows.push({ label: t('browser'), value: device });
  rows.push({ label: t('time'), value: formatMailTime(at, lng) });
  return rows;
};

/**
 * Where a request came from on one line, for a chat text: "Netherlands (approximate), Firefox on macOS". The time is
 * left out: a room stamps every message. Undefined outside a request, or when neither value is known.
 */
export const requestOrigin = (lng: string, details: RequestDetails | null) => {
  if (!details) return undefined;
  const origin = requestDetailRows(lng, details).slice(0, -1);
  return origin.map((row) => row.value).join(', ') || undefined;
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
  param: ParamPlaceholder = plainParam,
): EmailFrame {
  const declared = typeof template.requestDetails === 'function' ? template.requestDetails(statics) : template.requestDetails === true;
  return {
    requestDetails: details && declared ? requestDetailRows(lng, details) : undefined,
    sentTo: i18n.t('backend:email.sent_to', { lng, email: param('email'), ...plainText }),
    postalAddress: postalAddress(lng),
  };
}
