import i18n from 'i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import '~/lib/i18n';
import { NamedText } from '~/modules/common/named-text';

beforeAll(async () => {
  if (!i18n.isInitialized) await new Promise((resolve) => i18n.on('initialized', resolve));
});

/** The markup of the delete confirmation for an attachment of this name. */
const confirmation = (name: string) =>
  renderToStaticMarkup(<NamedText i18nKey="c:confirm.delete_resource" name={name} values={{ resource: 'Attachment' }} />);

describe('NamedText', () => {
  it('shows a name with markup in it as text', () => {
    const markup = renderToStaticMarkup(<NamedText i18nKey="c:confirm.delete_resource" name="<img src=x>" />);
    expect(markup).toContain('>&lt;img src=x&gt;</span>');
    expect(markup).not.toContain('<img');
  });

  it('must not parse a name as markup: its tags render as text and its attributes set no prop', () => {
    // Parsed as tags, `lists="x"` replaces the component's map and the layout's error boundary takes the page
    const markup = confirmation('a</strong><strong lists="x">b');
    expect(markup).toContain('<span class="sr-only">a&lt;/strong&gt;&lt;strong lists=&quot;x&quot;&gt;b</span>');
    expect(markup.match(/<strong/g)).toHaveLength(1);
  });

  it("shows a name with & and ' as typed, escaped once", () => {
    expect(confirmation("R&D & Q3's plan.pdf")).toContain('<span class="sr-only">R&amp;D &amp; Q3&#x27;s plan.pdf</span>');
  });
});
