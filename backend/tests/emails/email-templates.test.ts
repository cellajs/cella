/// <reference types="vite/client" />

import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import enBackend from '../../../locales/en/backend.json';
import { i18n } from '../../emails/i18n';
import { type EmailPreviewFixture, emailPreviewFixtures } from '../../emails/preview-fixtures';
import { render } from '../../emails/renderer/render';

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

// Sample render data is shared with the dev preview route via `preview-fixtures`.
// Cast to the loose fixture type so the heterogeneous defs don't collapse
// `translate`'s parameter to `never` across the union.
const templateEntries = (Object.entries(emailPreviewFixtures) as [string, EmailPreviewFixture][]).map(
  ([name, { def, statics, recipient }]) => ({ name, def, statics, recipient }),
);

/**
 * Render every email template via translate() + component() for each language.
 * Catches broken components, runtime errors, and keys missing from ALL languages.
 */
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
        // i18next returns the key string as-is when it can't resolve it.
        // Raw keys look like "backend:email.foo.bar" or just "email.foo.bar"
        const rawKeyPattern = /(?:backend|common|error):email\.[a-z_.-]+/;
        expect(html).not.toMatch(rawKeyPattern);
      });
    }
  }
});
