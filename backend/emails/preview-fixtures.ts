import type { RequestDetails } from '#/lib/request-details';
import { commentEmail } from '#/modules/notification/emails/comment-email';
import { digestEmail } from '#/modules/notification/emails/digest-email';
import { mentionEmail } from '#/modules/notification/emails/mention-email';
import {
  accountExistsEmail,
  accountSecurityEmail,
  invitationAddressEmail,
  magicLinkEmail,
  memberAddedEmail,
  memberInviteEmail,
  memberInviteWithTokenEmail,
  newsletterEmail,
  oauthVerificationEmail,
  requestInfoEmail,
  requestResponseEmail,
  stepUpEmail,
  systemInviteEmail,
  tenantRemovedEmail,
  welcomeEmailTemplate,
} from './index';
import type { EmailTemplateDef } from './types';

/** The address a preview names in its footer. */
export const previewRecipientEmail = 'emily@example.com';

/** The request a preview pretends to run in, so templates that declare request details show them. */
export const previewRequestDetails: RequestDetails = {
  requestId: 'd97be30c-c253-470d-948f-f2983733c77f',
  at: '2026-10-27T09:30:00.000Z',
  country: 'NL',
  browser: 'Firefox',
  os: 'macOS',
};

// biome-ignore lint/suspicious/noExplicitAny: registry holds defs with differing generic params
type AnyEmailTemplateDef = EmailTemplateDef<any, any>;

// Preview slugs are stable public identifiers (URLs, Storybook) and differ from some export names.
const previewTemplates = {
  welcome: welcomeEmailTemplate,
  'account-security': accountSecurityEmail,
  'account-exists': accountExistsEmail,
  'oauth-verification': oauthVerificationEmail,
  'magic-link': magicLinkEmail,
  'system-invite': systemInviteEmail,
  'member-invite': memberInviteEmail,
  'member-invite-with-token': memberInviteWithTokenEmail,
  'member-added': memberAddedEmail,
  'invitation-address': invitationAddressEmail,
  newsletter: newsletterEmail,
  'request-was-sent': requestResponseEmail,
  'request-was-sent-admin': requestInfoEmail,
  'step-up': stepUpEmail,
  'tenant-removed': tenantRemovedEmail,
  mention: mentionEmail,
  comment: commentEmail,
  digest: digestEmail,
} satisfies Record<string, AnyEmailTemplateDef>;

export type EmailPreviewName = keyof typeof previewTemplates;

/** Sample data lives on each template's `preview` field, type-checked against its own props. */
export const emailPreviews: Record<EmailPreviewName, AnyEmailTemplateDef> = previewTemplates;

export const emailPreviewNames = Object.keys(previewTemplates) as EmailPreviewName[];
