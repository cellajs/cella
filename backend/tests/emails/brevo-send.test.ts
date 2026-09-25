import { afterEach, describe, expect, it, vi } from 'vitest';
import { mailer, neutralizeBrevoTags } from '#/lib/mailer';
import { describeDigestRow, renderSectionsHtml } from '#/modules/notification/digest/build-digest';
import { digestEmail } from '#/modules/notification/emails/digest-email';
import { mentionEmail } from '#/modules/notification/emails/mention-email';
import { htmlToExcerpt } from '#/modules/notification/helpers/render-digest-html';
import type { SafeHtmlPolicy } from '../../emails/components/safe-html';
import { emailPreviewFixtures } from '../../emails/preview-fixtures';
import { render } from '../../emails/renderer/render';
import { oauthVerificationEmail } from '../../emails/templates/oauth-verification';
import { systemInviteEmail } from '../../emails/templates/system-invite';
import { brevoPlaceholder, type EmailRecipient, type EmailTemplateDef } from '../../emails/types';

type SentBody = { subject: string; htmlContent: string; messageVersions: { params: Record<string, string> }[] };

const link = 'https://app.example.test/item';
const unsubscribeLink = 'https://app.example.test/unsubscribe';
const tagOpener = /\{[{%#]/;
const anchorToEvil = /<a\b[^>]*evil\.example/i;
/** User text as OAuth sign-up or an author can store it: markup, a Brevo `|safe` print, autoescape off, a comment. */
const hostile = '<a href="https://evil.example">x</a>{{params.unsubscribeLink|safe}}{% autoescape off %}{# hide';

/** pongo2's `escape` filter, which Brevo applies to every param it fills without `|safe`. */
const pongoEscape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('>', '&gt;')
    .replaceAll('<', '&lt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/**
 * Brevo's side of a send, as pongo2 (its template engine) does it: `{{params.x}}` prints the value escaped,
 * `{{params.x|safe}}` prints it as is, and a printed value is never parsed again. The mailer leaves no other tag.
 */
const fillAsBrevo = (template: string, params: Record<string, string>) =>
  template.replace(/\{\{params\.(\w+)(\|safe)?\}\}|\{[{%#]/g, (match, key?: string, safe?: string) => {
    if (!key) throw new Error(`Brevo tag left in the mail: ${match}`);
    const value = params[key] ?? '';
    return safe ? value : pongoEscape(value);
  });

/** A per-recipient param's value: the mailer suffixes every param key with a nonce drawn for the send. */
const paramValue = (params: Record<string, string>, key: string) =>
  Object.entries(params).find(([name]) => new RegExp(`^${key}_[0-9a-f]{16}$`).test(name))?.[1];

/** Sends through the real Brevo path with the network stubbed, and returns the request body. */
const send = async <TStatic, TRecipient extends EmailRecipient>(
  template: EmailTemplateDef<TStatic, TRecipient>,
  statics: TStatic,
  recipient: TRecipient,
) => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  // Under Vitest `env` reads process.env directly.
  process.env.BREVO_API_KEY = 'test-brevo-key';
  process.env.TEST_SEND_EMAILS = 'true';
  await mailer.prepareEmails(template, statics, [recipient]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as SentBody;
  const params = body.messageVersions[0]?.params ?? {};
  return { body, params, html: fillAsBrevo(body.htmlContent, params) };
};

afterEach(() => {
  delete process.env.BREVO_API_KEY;
  delete process.env.TEST_SEND_EMAILS;
  vi.unstubAllGlobals();
});

/**
 * The mailer renders each mail once per language and leaves per-recipient values as Brevo placeholders. Brevo fills
 * `{{params.x}}` escaped, and a param declared as app-built HTML through `{{params.x|safe}}`.
 */
describe('Mails as Brevo fills them', () => {
  const mentionRecipient = {
    email: 'mentioned@example.test',
    lng: 'en',
    subjectTitle: 'Roadmap',
    excerpt: 'See this',
    link,
    unsubscribeLink,
  };

  it('must not open a Brevo template tag via a name rendered into the mail', async () => {
    const hostileName = '{{ params.excerpt|safe }}{% autoescape off %}{# hidden';
    const { body } = await send(mentionEmail, { actorName: hostileName, channelName: hostileName }, mentionRecipient);

    const ownPlaceholders = /\{\{params\.(?:subjectTitle|excerpt|link|unsubscribeLink)_[0-9a-f]{16}\}\}/g;
    expect(body.htmlContent.replace(ownPlaceholders, '')).not.toMatch(tagOpener);
    expect(body.subject).not.toMatch(tagOpener);
    // The name still reads as typed: only the brace that opens a tag is written as a character reference.
    expect(body.htmlContent).toContain('&#123;{ params.excerpt|safe }}');
  });

  it('must not print a param unescaped via |safe on a key not declared as HTML', async () => {
    const { body, html } = await send(
      mentionEmail,
      { actorName: '{{params.excerpt|safe}}', channelName: 'Design 101' },
      { ...mentionRecipient, excerpt: '<a href="https://evil.example">x</a>' },
    );

    expect(body.htmlContent).not.toContain('{{params.excerpt|safe}}');
    expect(html).not.toMatch(anchorToEvil);
  });

  it("must not fill a param via its exact placeholder typed into a user's text", async () => {
    const typed = '{{params.email}} {{params.unsubscribeLink}} {{params.link}}';
    const { body, html } = await send(mentionEmail, { actorName: typed, channelName: typed }, mentionRecipient);

    // No param key can be named without the send's nonce: the typed placeholders read as typed.
    expect(html).not.toContain(mentionRecipient.email);
    expect(html.split(unsubscribeLink)).toHaveLength(2);
    expect(body.htmlContent).toContain('&#123;{params.email}}');
    expect(body.subject).not.toMatch(tagOpener);
  });

  it('fills the params a template names in its translated text (positive control)', async () => {
    const invite = await send(
      systemInviteEmail,
      { senderName: '{{params.name}}', senderThumbnailUrl: null },
      { email: 'emily@example.test', lng: 'en', name: 'Emily', inviteLink: link },
    );
    expect(invite.html).toContain('Hi Emily,');
    // The sender's name typed as that placeholder stays text.
    expect(invite.body.htmlContent).toContain('&#123;{params.name}}');

    const verification = await send(
      oauthVerificationEmail,
      { name: 'Emily', verificationLink: link, providerEmail: 'emily@provider.example', providerName: 'GitHub' },
      { email: 'emily@example.test', lng: 'en' },
    );
    expect(verification.html).toContain('emily@example.test');
  });

  it('fills a mention excerpt escaped once', async () => {
    const excerpt = htmlToExcerpt('<p>Tom &amp; Jerry &lt;3</p>', 250);
    const { html } = await send(
      mentionEmail,
      { actorName: 'Jane', channelName: 'Design 101' },
      {
        ...mentionRecipient,
        excerpt,
      },
    );

    expect(html).toContain('Tom &amp; Jerry &lt;3');
    expect(html).not.toContain('&amp;amp;');
  });

  it('must not run user text in a digest section as markup or Brevo syntax', async () => {
    const sectionsHtml = renderSectionsHtml([
      { channelId: 'c1', channelName: hostile, lines: [describeDigestRow('comment', hostile, 'en')], overflow: 0 },
    ]);
    const { params, html } = await send(
      digestEmail,
      { daily: true },
      { email: 'reader@example.test', lng: 'en', sectionsHtml, unsubscribeLink },
    );

    expect(paramValue(params, 'sectionsHtml')).not.toMatch(tagOpener);
    expect(html).not.toMatch(anchorToEvil);
    expect(html).toContain('<h3>&lt;a href=');
    // The unsubscribe link is printed only where the template puts it.
    expect(html.split(unsubscribeLink)).toHaveLength(2);
  });

  it('renders a digest section as HTML (positive control)', async () => {
    const sectionsHtml = renderSectionsHtml([
      {
        channelId: 'c1',
        channelName: 'Design 101',
        lines: [describeDigestRow('comment', 'Roadmap', 'en')],
        overflow: 2,
      },
    ]);
    const { html } = await send(
      digestEmail,
      { daily: false },
      { email: 'reader@example.test', lng: 'en', sectionsHtml, unsubscribeLink },
    );

    expect(html).toContain('<h3>Design 101</h3><ul><li>New comment on <strong>Roadmap</strong></li>');
    expect(html).toContain('<li>and 2 more</li></ul>');
  });

  it("keeps the mailer's own placeholders for Brevo to fill and escape (positive control)", async () => {
    const { body, params } = await send(
      mentionEmail,
      { actorName: 'Jane', channelName: 'Design 101' },
      mentionRecipient,
    );

    for (const key of ['subjectTitle', 'excerpt', 'link']) {
      expect(body.htmlContent).toMatch(new RegExp(`\\{\\{params\\.${key}_[0-9a-f]{16}\\}\\}`));
    }
    expect(body.subject).toBe('Jane mentioned you in Design 101');
    expect(paramValue(params, 'excerpt')).toBe(mentionRecipient.excerpt);
  });
});

describe('neutralizeBrevoTags', () => {
  /** Renders a template's preview as the mailer does and checks that the pass leaves it as it is. */
  const expectUnchanged = async <TStatic, TRecipient extends EmailRecipient>(
    def: EmailTemplateDef<TStatic, TRecipient>,
  ) => {
    const htmlParams: Partial<Record<string, SafeHtmlPolicy>> = { ...def.htmlParams };
    const keys = Object.keys(def.preview.recipient);
    const { subject, ...props } = def.translate('en', def.preview.statics);
    const placeholders = Object.fromEntries(keys.map((key) => [key, brevoPlaceholder(key, htmlParams)]));
    const html = await render(def.component({ ...props, ...placeholders }));
    const params = [...keys, 'email'];
    expect(neutralizeBrevoTags(html, { params, htmlParams: Object.keys(htmlParams) }, 'html')).toBe(html);
    expect(neutralizeBrevoTags(subject, { params }, 'text')).toBe(subject);
  };

  it('leaves every template, rendered as the mailer renders it, unchanged', async () => {
    for (const { def } of Object.values(emailPreviewFixtures)) await expectUnchanged(def);
    await expectUnchanged(mentionEmail);
    await expectUnchanged(digestEmail);
  });

  it('keeps |safe only for a declared HTML param', () => {
    const content = '{{params.sectionsHtml|safe}} {{params.link|safe}} {{params.link}} {{params.other}}';
    expect(
      neutralizeBrevoTags(content, { params: ['sectionsHtml', 'link'], htmlParams: ['sectionsHtml'] }, 'html'),
    ).toBe('{{params.sectionsHtml|safe}} &#123;{params.link|safe}} {{params.link}} &#123;{params.other}}');
  });
});
