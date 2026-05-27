/// <reference types="vite/client" />

import { render } from 'jsx-email';
import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import enBackend from '../../../locales/en/backend.json';
import {
  accountSecurityEmail,
  emailVerificationEmail,
  memberAddedEmail,
  memberInviteEmail,
  memberInviteWithTokenEmail,
  newsletterEmail,
  oauthVerificationEmail,
  requestInfoEmail,
  requestResponseEmail,
  systemInviteEmail,
} from '../../emails';
import i18n from '../../emails/i18n';

// Collect all email.* keys from English (source of truth)
const enEmailKeys = Object.keys(enBackend).filter((k) => k.startsWith('email.'));

/**
 * Verify that every email key resolves to actual text (not a raw key) in all languages.
 * Missing translations are fine as long as the fallback mechanism produces real text.
 */
describe('email translation fallback', () => {
  for (const lng of appConfig.languages) {
    it(`all email keys resolve to text in ${lng}`, () => {
      const broken: string[] = [];

      for (const key of enEmailKeys) {
        const result = i18n.t(`backend:${key}`, { lng });
        // i18next returns the key itself when it can't resolve it
        if (result === key || result === `backend:${key}`) {
          broken.push(key);
        }
      }

      expect(broken, `Keys that failed to resolve in ${lng}:\n${broken.join('\n')}`).toEqual([]);
    });
  }
});

// Template definitions with sample static props for rendering tests
const templateEntries = [
  {
    name: 'account-security',
    def: accountSecurityEmail,
    statics: { name: 'Emily', type: 'totp-lockout' as const },
  },
  {
    name: 'email-verification',
    def: emailVerificationEmail,
    statics: { verificationLink: 'https://example.com/verify', name: 'Emily' },
  },
  {
    name: 'oauth-verification',
    def: oauthVerificationEmail,
    statics: {
      verificationLink: 'https://example.com/verify',
      name: 'Emily',
      providerEmail: 'jane@gmail.com',
      providerName: 'Google',
    },
  },
  { name: 'system-invite', def: systemInviteEmail, statics: { senderName: 'John', senderThumbnailUrl: null } },
  {
    name: 'member-invite',
    def: memberInviteEmail,
    statics: { senderName: 'John', senderThumbnailUrl: null, entityName: 'Acme', role: 'member' as const },
  },
  {
    name: 'member-invite-with-token',
    def: memberInviteWithTokenEmail,
    statics: { senderName: 'John', senderThumbnailUrl: null, entityName: 'Acme', role: 'member' as const },
  },
  {
    name: 'member-added',
    def: memberAddedEmail,
    statics: { senderName: 'John', senderThumbnailUrl: null, entityName: 'Acme', role: 'member' as const },
  },
  {
    name: 'newsletter',
    def: newsletterEmail,
    statics: { content: '<p>Test content</p>', subject: 'Monthly newsletter', testEmail: false },
  },
  { name: 'request-was-sent', def: requestResponseEmail, statics: { type: 'contact' as const, message: null } },
  {
    name: 'request-was-sent-admin',
    def: requestInfoEmail,
    statics: { type: 'contact' as const, email: 'test@example.com', message: 'Hello', subject: 'New contact request' },
  },
];

/**
 * Render every email template via translate() + component() for each language.
 * Catches broken components, runtime errors, and keys missing from ALL languages.
 */
describe('email template rendering', () => {
  for (const { name, def, statics } of templateEntries) {
    for (const lng of appConfig.languages) {
      it(`${name} renders without error in ${lng}`, async () => {
        const translated = def.translate(lng, statics as any);
        const html = await render(def.component(translated));
        expect(html).toBeTruthy();
        expect(html.length).toBeGreaterThan(100);
      });

      it(`${name} contains no raw translation keys in ${lng}`, async () => {
        const translated = def.translate(lng, statics as any);
        const html = await render(def.component(translated));
        // i18next returns the key string as-is when it can't resolve it.
        // Raw keys look like "backend:email.foo.bar" or just "email.foo.bar"
        const rawKeyPattern = /(?:backend|common|error):email\.[a-z_.-]+/;
        expect(html).not.toMatch(rawKeyPattern);
      });
    }
  }
});
