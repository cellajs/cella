import i18n from 'i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { initReactI18next } from 'react-i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import { locales, type TKey } from '~/lib/i18n-locales';
import { ConfirmText } from '~/modules/common/confirm-text';

/** Every confirmation that names what it hits, with the values its call site passes and the part that must show in bold. */
const confirmations: { i18nKey: TKey; values: Record<string, string | number>; bold: string }[] = [
  { i18nKey: 'c:delete_confirm.text', values: { name: 'Report.pdf' }, bold: 'Report.pdf' },
  { i18nKey: 'c:confirm.revoke_api_key', values: { name: 'gerer' }, bold: 'gerer' },
  { i18nKey: 'c:confirm.leave_channel', values: { name: 'Acme' }, bold: 'Acme' },
  { i18nKey: 'c:confirm.delete_resource', values: { name: 'Acme', resource: 'organization' }, bold: 'Acme' },
  { i18nKey: 'c:confirm.delete_counted_resource', values: { count: 3, resource: 'attachments' }, bold: '3 attachments' },
  { i18nKey: 'c:confirm.delete_account', values: { email: 'ada@example.com', appName: 'App' }, bold: 'ada@example.com' },
  {
    i18nKey: 'c:confirm.remove_members',
    values: { emails: 'ada@example.com, bob@example.com', entityType: 'organization' },
    bold: 'ada@example.com, bob@example.com',
  },
];

const markup = (i18nKey: TKey, values: Record<string, string | number>) => renderToStaticMarkup(<ConfirmText i18nKey={i18nKey} values={values} />);

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', resources: locales, defaultNS: 'c', interpolation: { escapeValue: false } });
});

describe('ConfirmText', () => {
  it.each(confirmations)('$i18nKey shows what it hits in bold', ({ i18nKey, values, bold }) => {
    expect(markup(i18nKey, values)).toContain(`<strong class="font-semibold text-foreground">${bold}</strong>`);
  });

  it('leaves no stray markup or interpolation in the sentence', () => {
    for (const { i18nKey, values } of confirmations) {
      const text = markup(i18nKey, values).replace(/<strong[^>]*>|<\/strong>/g, '');
      expect(text).not.toMatch(/[<>{}]| [?.]/);
    }
  });

  it('shows a name with markup in it as text', () => {
    expect(markup('c:delete_confirm.text', { name: '<img src=x>' })).toContain('>&lt;img src=x&gt;</strong>');
  });
});
