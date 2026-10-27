import { appConfig } from 'shared';
import { type LinkTokenType, tokenPolicies } from '#/modules/auth/tokens/token-policies';
import type { TimeSpan } from '#/utils/time-span';
import { i18n, plainText } from './i18n';

const unitNames: Record<TimeSpan['unit'], string> = { ms: 'millisecond', s: 'second', m: 'minute', h: 'hour', d: 'day', w: 'week' };

/** "This link expires in 15 minutes.", from the link type's own lifetime, so the mail and the token cannot disagree. */
export const linkExpiresText = (lng: string, type: LinkTokenType) => {
  const { ttl } = tokenPolicies[type];
  const duration = new Intl.NumberFormat(lng, { style: 'unit', unit: unitNames[ttl.unit], unitDisplay: 'long' }).format(ttl.value);
  return i18n.t('backend:email.link_expires', { lng, duration, ...plainText });
};

/**
 * What a reader does when the mail was not their doing: `ignore` a link nothing happens without, `secure` an account
 * someone acted in, `reply` to say so. Translated HTML for the end of the body panel.
 */
export const endingFor = (lng: string, kind: 'ignore' | 'secure' | 'reply') =>
  i18n.t(`backend:email.ending.${kind}`, { lng, accountUrl: `${appConfig.frontendUrl}/account` });

/**
 * The ending of a mail another person caused: ignoring it is safe, and replying reaches them when the send names their
 * address as the reply target.
 */
export const senderEndingFor = (lng: string, { senderName, senderEmail, ignorable }: SenderEnding) =>
  [
    ignorable && i18n.t('backend:email.ending.invitation', { lng }),
    senderEmail && i18n.t('backend:email.ending.reply_to_sender', { lng, senderName }),
  ]
    .filter(Boolean)
    .join(' ');

interface SenderEnding {
  senderName: string;
  /** The address replies go to; without one the reply clause is left out. */
  senderEmail?: string;
  /** True when nothing happens until the reader acts, as with an invitation. */
  ignorable: boolean;
}

/**
 * The person who caused a mail, as translated HTML: their name, and their address when known, so a reader can tell
 * them from anyone who typed the same display name.
 */
export const senderHtml = (lng: string, name: string, email?: string) =>
  email ? i18n.t('backend:email.sender_with_address', { lng, name, email }) : i18n.t('backend:email.sender', { lng, name });
