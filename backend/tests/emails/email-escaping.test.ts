import { hierarchy } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mailer, neutralizeBrevoTags } from '#/lib/mailer';
import { describeDigestRow } from '#/modules/notification/digest/build-digest';
import { mentionEmail } from '#/modules/notification/emails/mention-email';
import {
  magicLinkEmail,
  memberAddedEmail,
  memberInviteEmail,
  memberInviteWithTokenEmail,
  systemInviteEmail,
} from '../../emails';
import { EmailButton } from '../../emails/components';
import { type EmailPreviewName, emailPreviewFixtures } from '../../emails/preview-fixtures';
import { renderEmailPreview } from '../../emails/render-preview';
import { render } from '../../emails/renderer/render';

/** A display name as OAuth sign-up can store it: user and organization names reach these mails unvalidated. */
const hostile = '<a href="https://evil.example">x</a>';
const anchorToEvil = /<a\b[^>]*evil\.example/i;
const doubleEscaped = /&amp;(?:amp|lt|gt|quot|#)/;

const role = hierarchy.getLeastPrivilegedRole('organization');
const link = 'https://app.example.test/invite';

describe('email templates escape names interpolated into HTML', () => {
  it('must not inject a link into a member invite via the sender or organization name', async () => {
    const statics = { senderName: hostile, senderThumbnailUrl: null, entityName: hostile, role };
    const translated = memberInviteEmail.translate('en', statics);
    const html = await render(memberInviteEmail.component({ ...translated, name: 'Emily', memberInviteLink: link }));

    expect(html).not.toMatch(anchorToEvil);
    expect(html).toContain('&lt;a href=');
    // Markup that belongs to the translation itself survives.
    expect(html).toContain('<strong>');
  });

  it('must not inject a link into an invite with token, a member-added or a system invite mail', async () => {
    const statics = { senderName: hostile, senderThumbnailUrl: null, entityName: hostile, role };
    const withToken = memberInviteWithTokenEmail.translate('en', statics);
    const added = memberAddedEmail.translate('en', statics);
    const system = systemInviteEmail.translate('en', { senderName: hostile, senderThumbnailUrl: null });
    const htmls = await Promise.all([
      render(memberInviteWithTokenEmail.component({ ...withToken, name: 'Emily', inviteLink: link })),
      render(memberAddedEmail.component({ ...added, name: 'Emily', entityLink: link })),
      render(systemInviteEmail.component({ ...system, name: 'Emily', inviteLink: link })),
    ]);

    for (const html of htmls) {
      expect(html).not.toMatch(anchorToEvil);
      expect(html).toContain('&lt;a href=');
    }
  });

  it('must not inject a link into a mention mail via the actor name', async () => {
    const translated = mentionEmail.translate('en', { actorName: hostile, channelName: hostile });
    const html = await render(
      mentionEmail.component({
        ...translated,
        subjectTitle: 'Roadmap',
        excerpt: 'See this',
        link,
        unsubscribeLink: 'https://app.example.test/unsubscribe',
      }),
    );

    expect(html).not.toMatch(anchorToEvil);
    expect(html).toContain('&lt;a href=');
  });

  it('must not inject a link into a digest line via a context title', () => {
    expect(describeDigestRow('comment', hostile, 'en')).not.toMatch(anchorToEvil);
    expect(describeDigestRow('comment', hostile, 'en')).toContain('<strong>&lt;a href=');
    expect(describeDigestRow('comment', 'Roadmap', 'en')).toBe('New comment on <strong>Roadmap</strong>');
    expect(describeDigestRow('unknown-type', '', 'en')).toBe('New activity on <strong>-</strong>');
  });
});

describe('email button', () => {
  it('must not inject markup into the Outlook fallback via the button text or link', async () => {
    const html = await render(EmailButton({ ButtonText: '<b>Join</b>', href: 'https://app.example.test/?a=1&b="x"' }));
    const fallback = html.slice(html.indexOf('<!--[if mso]>'), html.indexOf('<![endif]-->'));

    expect(fallback).toContain('&lt;b&gt;Join&lt;/b&gt;');
    expect(fallback).not.toContain('<b>');
    expect(fallback).toContain('href="https://app.example.test/?a=1&amp;b=&quot;x&quot;"');
  });
});

describe('email plain-text parts keep names as typed', () => {
  const statics = { senderName: 'Jane', senderThumbnailUrl: null, entityName: 'R&D <Lab>', role };

  it('leaves the subject and preview unescaped, and the rendered mail escapes them once', async () => {
    const translated = memberInviteEmail.translate('en', statics);
    expect(translated.subject).toBe('Invitation to R&D <Lab>');
    expect(translated.previewText).toContain('R&D <Lab>');

    const html = await render(memberInviteEmail.component({ ...translated, name: 'Emily', memberInviteLink: link }));
    expect(html).not.toMatch(doubleEscaped);
    expect(html).not.toContain('<Lab>');
  });

  it('escapes a greeting name once', async () => {
    const translated = magicLinkEmail.translate('en', {
      magicLinkUrl: link,
      name: "O'Brien & <Co>",
      isNewUser: false,
    });
    expect(translated.hiText).toBe("Hi O'Brien & <Co>,");

    const html = await render(magicLinkEmail.component({ ...translated }));
    expect(html).not.toMatch(doubleEscaped);
    expect(html).not.toContain('<Co>');
  });
});

/**
 * Brevo renders subject and body as templates and fills and HTML-escapes the mailer's `{{params.x}}` placeholders.
 * Text rendered into the mail, such as a name, must not open a template tag of its own.
 */
describe('Brevo template tags in rendered mails', () => {
  const tagOpener = /\{[{%#]/;
  const hostileName = '{{ params.excerpt|safe }}{% autoescape off %}{# hidden';
  const recipient = {
    email: 'mentioned@example.test',
    lng: 'en',
    subjectTitle: 'Roadmap',
    excerpt: 'See <b>this</b>',
    link,
    unsubscribeLink: 'https://app.example.test/unsubscribe',
  };
  const ownPlaceholders = /\{\{params\.(?:subjectTitle|excerpt|link|unsubscribeLink|email)\}\}/g;

  /** Sends through the real Brevo path with the network stubbed, and returns the request body. */
  const sentBody = async (statics: { actorName: string; channelName: string }) => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    // Under Vitest `env` reads process.env directly.
    process.env.BREVO_API_KEY = 'test-brevo-key';
    process.env.TEST_SEND_EMAILS = 'true';
    await mailer.prepareEmails(mentionEmail, statics, [recipient]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      subject: string;
      htmlContent: string;
      messageVersions: { params: Record<string, string> }[];
    };
  };

  afterEach(() => {
    delete process.env.BREVO_API_KEY;
    delete process.env.TEST_SEND_EMAILS;
    vi.unstubAllGlobals();
  });

  it('must not open a Brevo template tag via a name rendered into the mail', async () => {
    const body = await sentBody({ actorName: hostileName, channelName: hostileName });

    expect(body.htmlContent.replace(ownPlaceholders, '')).not.toMatch(tagOpener);
    expect(body.subject).not.toMatch(tagOpener);
    // The name still reads as typed: only the brace that opens a tag is written as a character reference.
    expect(body.htmlContent).toContain('&#123;{ params.excerpt|safe }}');
  });

  it('leaves every template, rendered as the mailer renders it, unchanged', async () => {
    for (const [name, { recipient: sample }] of Object.entries(emailPreviewFixtures)) {
      const { subject, html } = await renderEmailPreview(name as EmailPreviewName, { lng: 'en', placeholders: true });
      const paramKeys = [...Object.keys(sample), 'email'];
      expect(neutralizeBrevoTags(html, paramKeys, 'html'), name).toBe(html);
      expect(neutralizeBrevoTags(subject, paramKeys, 'text'), name).toBe(subject);
    }
  });

  it("keeps the mailer's own placeholders for Brevo to fill and escape (positive control)", async () => {
    const body = await sentBody({ actorName: 'Jane', channelName: 'Design 101' });

    for (const placeholder of ['{{params.subjectTitle}}', '{{params.excerpt}}', '{{params.link}}']) {
      expect(body.htmlContent).toContain(placeholder);
    }
    expect(body.subject).toBe('Jane mentioned you in Design 101');
    expect(body.messageVersions[0]?.params.excerpt).toBe(recipient.excerpt);
  });
});
