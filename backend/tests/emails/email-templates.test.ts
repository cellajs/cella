/// <reference types="vite/client" />

import { readFileSync } from 'node:fs';
import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import enBackend from '../../../locales/en/backend.json';
import { emailFrame } from '../../emails/frame';
import { i18n } from '../../emails/i18n';
import { emailPreviewNames, emailPreviews, previewRequestDetails } from '../../emails/preview-fixtures';
import { render } from '../../emails/renderer/render';
import { accountSecurityEmail } from '../../emails/templates/account-security';

// English is the source of truth for email.* keys.
const enEmailKeys = Object.keys(enBackend).filter((k) => k.startsWith('email.'));

/** A missing translation is fine as long as the fallback produces real text, not a raw key. */
describe('email translation fallback', () => {
  for (const lng of appConfig.languages) {
    it(`all email keys resolve to text in ${lng}`, () => {
      const broken: string[] = [];

      for (const key of enEmailKeys) {
        const result = i18n.t(`backend:${key}`, { lng });
        // i18next returns the key itself when it cannot resolve it.
        if (result === key || result === `backend:${key}`) {
          broken.push(key);
        }
      }

      expect(broken, `Keys that failed to resolve in ${lng}:\n${broken.join('\n')}`).toEqual([]);
    });
  }
});

/** Catches broken components, runtime errors, and keys missing from every language. */
describe('email template rendering', () => {
  for (const [name, def] of Object.entries(emailPreviews)) {
    const { statics, recipient } = def.preview;
    for (const lng of appConfig.languages) {
      it(`${name} renders without error in ${lng}`, async () => {
        const translated = def.translate(lng, statics);
        const html = await render(def.component({ ...translated, ...recipient, frame: emailFrame(def, statics, lng, previewRequestDetails) }));
        expect(html).toBeTruthy();
        expect(html.length).toBeGreaterThan(100);
      });

      it(`${name} contains no raw translation keys in ${lng}`, async () => {
        const translated = def.translate(lng, statics);
        const html = await render(def.component({ ...translated, ...recipient, frame: emailFrame(def, statics, lng, previewRequestDetails) }));
        // i18next answers a key it cannot resolve with the key minus its namespace, like "email.foo.bar".
        const rawKeyPattern = /\bemail\.[a-z0-9_]+(?:\.[a-z0-9_]+)+\b/;
        expect(html).not.toMatch(rawKeyPattern);
      });
    }
  }
});

// Storybook indexes stories from static exports, so each preview needs its own line in the stories file.
describe('email storybook', () => {
  it('has a story for every preview', () => {
    const storiesUrl = new URL('../../../frontend/src/stories/email-templates.stories.tsx', import.meta.url);
    const stories = readFileSync(storiesUrl, 'utf8');
    const missing = emailPreviewNames.filter((name) => !stories.includes(`makeEmailStory('${name}')`));
    expect(missing).toEqual([]);
  });
});

/** Details reach these mails from request data (route, tenant name, browser), and the body is rendered as HTML. */
describe('account security email escapes its details', () => {
  const hostile = '<a href="https://evil.test">click</a>';

  it('renders markup in a detail as text, never as a link', async () => {
    const details = { tenantName: hostile, userEmail: 'a@b.test' };
    const statics = { name: 'Emily', type: 'tenant-created', details } as const;
    const translated = accountSecurityEmail.translate('en', statics);
    const html = await render(accountSecurityEmail.component({ ...translated, frame: {} }));

    // The detail survives as visible text; no anchor element comes out of it.
    expect(html).not.toContain('<a href="https://evil.test"');
    expect(html).toContain('&lt;a href');
    // Markup that belongs to the translation itself survives.
    expect(html).toContain('<strong>');
  });

  it('ends a new sign-in notice with a working link to the account', async () => {
    const translated = accountSecurityEmail.translate('en', { name: 'Emily', type: 'new-sign-in', details: { strategy: 'Passkey' } });
    const html = await render(accountSecurityEmail.component({ ...translated, frame: {} }));

    expect(html).toContain(`href="${appConfig.frontendUrl}/account"`);
  });
});
