import {
  accountSecurityEmail,
  emailVerificationEmail,
  magicLinkEmail,
  memberAddedEmail,
  memberInviteEmail,
  memberInviteWithTokenEmail,
  newsletterEmail,
  oauthVerificationEmail,
  requestInfoEmail,
  requestResponseEmail,
  systemInviteEmail,
  welcomeEmailTemplate,
} from './index';
import type { EmailTemplateDef } from './types';

/** Sample data lives on each template's `preview` field, type-checked against its own props. */
export interface EmailPreviewFixture {
  // biome-ignore lint/suspicious/noExplicitAny: registry holds defs with differing generic params
  def: EmailTemplateDef<any, any>;
  statics: Record<string, unknown>;
  recipient: Record<string, string>;
}

// Preview slugs are stable public identifiers (URLs, Storybook) and differ from some export names.
const previewTemplates = {
  welcome: welcomeEmailTemplate,
  'account-security': accountSecurityEmail,
  'email-verification': emailVerificationEmail,
  'oauth-verification': oauthVerificationEmail,
  'magic-link': magicLinkEmail,
  'system-invite': systemInviteEmail,
  'member-invite': memberInviteEmail,
  'member-invite-with-token': memberInviteWithTokenEmail,
  'member-added': memberAddedEmail,
  newsletter: newsletterEmail,
  'request-was-sent': requestResponseEmail,
  'request-was-sent-admin': requestInfoEmail,
  // biome-ignore lint/suspicious/noExplicitAny: registry holds defs with differing generic params
} satisfies Record<string, EmailTemplateDef<any, any>>;

export const emailPreviewFixtures = Object.fromEntries(
  Object.entries(previewTemplates).map(([name, def]): [string, EmailPreviewFixture] => [
    name,
    {
      def,
      statics: def.preview.statics as unknown as Record<string, unknown>,
      recipient: def.preview.recipient as unknown as Record<string, string>,
    },
  ]),
) as Record<keyof typeof previewTemplates, EmailPreviewFixture>;

export type EmailPreviewName = keyof typeof previewTemplates;

export const emailPreviewNames = Object.keys(previewTemplates) as EmailPreviewName[];
