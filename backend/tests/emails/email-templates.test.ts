/// <reference types="vite/client" />

import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import enBackend from '../../../locales/en/backend.json';
import { i18n } from '../../emails/i18n';
import { type EmailPreviewFixture, emailPreviewFixtures } from '../../emails/preview-fixtures';
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

// The cast to the loose fixture type stops the heterogeneous defs collapsing
// `translate`'s parameter to `never` across the union.
const templateEntries = (Object.entries(emailPreviewFixtures) as [string, EmailPreviewFixture][]).map(
  ([name, { def, statics, recipient }]) => ({ name, def, statics, recipient }),
);

/** Catches broken components, runtime errors, and keys missing from every language. */
describe('email template rendering', () => {
  for (const { name, def, statics, recipient } of templateEntries) {
    for (const lng of appConfig.languages) {
      it(`${name} renders without error in ${lng}`, async () => {
        const translated = def.translate(lng, statics);
        const html = await render(def.component({ ...translated, ...recipient }));
        expect(html).toBeTruthy();
        expect(html.length).toBeGreaterThan(100);
      });

      it(`${name} contains no raw translation keys in ${lng}`, async () => {
        const translated = def.translate(lng, statics);
        const html = await render(def.component({ ...translated, ...recipient }));
        // Unresolved keys come back as-is, like "backend:email.foo.bar".
        const rawKeyPattern = /(?:backend|common|error):email\.[a-z_.-]+/;
        expect(html).not.toMatch(rawKeyPattern);
      });
    }
  }
});

/** Details reach these mails from request data (route, tenant name, browser), and the body is rendered as HTML. */
describe('account security email escapes its details', () => {
  const hostile = '<a href="https://evil.test">click</a>';

  it('renders markup in a detail as text, never as a link', async () => {
    const details = { tenantName: hostile, userEmail: 'a@b.test', timestamp: 'now' };
    const statics = { name: 'Emily', type: 'tenant-created', details } as const;
    const translated = accountSecurityEmail.translate('en', statics);
    const html = await render(accountSecurityEmail.component(translated));

    // The detail survives as visible text; no anchor element comes out of it.
    expect(html).not.toContain('<a href="https://evil.test"');
    expect(html).toContain('&lt;a href');
    // Markup that belongs to the translation itself survives.
    expect(html).toContain('<strong>');
  });

  it('keeps the account link of a new sign-in notice working after escaping', async () => {
    const details = {
      timestamp: '2026-01-01 09:30:00 UTC',
      browser: 'Firefox',
      os: 'macOS',
      country: 'Netherlands',
      strategy: 'Passkey',
      accountUrl: 'https://app.example.test/account',
    };
    const translated = accountSecurityEmail.translate('en', { name: 'Emily', type: 'new-sign-in', details });
    const html = await render(accountSecurityEmail.component(translated));

    expect(html).toContain('href="https://app.example.test/account"');
    expect(html).toContain('<strong>When:</strong> 2026-01-01 09:30:00 UTC');
    expect(html).toContain('<br');
  });
});

describe('new sign-in notice location line', () => {
  const details = {
    timestamp: '2026-01-01 09:30:00 UTC',
    browser: 'Firefox',
    os: 'macOS',
    strategy: 'Passkey',
    accountUrl: 'https://app.example.test/account',
  };

  it('names the country when GeoIP resolved one, escaped like every other detail', async () => {
    const translated = accountSecurityEmail.translate('en', {
      name: 'Emily',
      type: 'new-sign-in',
      details: { ...details, country: 'Nether<lands' },
    });
    const html = await render(accountSecurityEmail.component(translated));

    expect(html).toContain('<strong>Location:</strong> Nether&lt;lands (approximate)');
    expect(html).toContain('<strong>Browser:</strong> Firefox on macOS');
  });

  it('leaves the line out entirely when no country is known', async () => {
    const translated = accountSecurityEmail.translate('en', { name: 'Emily', type: 'new-sign-in', details });
    const html = await render(accountSecurityEmail.component(translated));

    expect(html).not.toContain('Location');
    expect(html).not.toContain('unknown');
    expect(html).toContain('<strong>Browser:</strong> Firefox on macOS<br><strong>Method:</strong> Passkey');
  });
});
