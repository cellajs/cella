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

/**
 * A single email preview fixture: enough sample data to render one template.
 *
 * - `statics` are the props shared across all recipients (passed to `translate`).
 * - `recipient` are the per-recipient display props the component reads (the
 *   values the mailer turns into Brevo `{{params.x}}` placeholders at send time).
 *
 * Sample data now lives on each template's `preview` field (type-checked against
 * the template's own props). This registry just maps the preview slug — which
 * doubles as the dev-preview URL and Storybook story name — to its template.
 */
export interface EmailPreviewFixture {
  // Template defs are heterogeneous (each binds its own statics/recipient shape).
  // biome-ignore lint/suspicious/noExplicitAny: registry holds defs with differing generic params
  def: EmailTemplateDef<any, any>;
  statics: Record<string, unknown>;
  recipient: Record<string, string>;
}

// Maps each preview slug to its template. Slugs are stable public identifiers
// (URLs + Storybook stories) and intentionally differ from some export names.
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
