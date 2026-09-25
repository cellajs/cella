import { hierarchy } from 'shared';
import { describe, expect, it } from 'vitest';
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
