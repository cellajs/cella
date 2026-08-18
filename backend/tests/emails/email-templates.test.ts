/// <reference types="vite/client" />

import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import enBackend from '../../../locales/en/backend.json';
import { i18n } from '../../emails/i18n';
import { type EmailPreviewFixture, emailPreviewFixtures } from '../../emails/preview-fixtures';
import { render } from '../../emails/renderer/render';

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
