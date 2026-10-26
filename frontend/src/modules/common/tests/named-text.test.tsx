import i18n from 'i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { initReactI18next } from 'react-i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import { locales } from '~/lib/i18n-locales';
import { NamedText } from '~/modules/common/named-text';

beforeAll(async () => {
  // As `lib/i18n.ts` configures it: interpolation leaves escaping to React
  await i18n.use(initReactI18next).init({ lng: 'en', resources: locales, defaultNS: 'c', interpolation: { escapeValue: false } });
});

describe('NamedText', () => {
  it('shows a name with markup in it as text', () => {
    const markup = renderToStaticMarkup(<NamedText i18nKey="c:delete_confirm.text" name="<img src=x>" />);
    expect(markup).toContain('>&lt;img src=x&gt;</span>');
    expect(markup).not.toContain('<img');
  });
});
