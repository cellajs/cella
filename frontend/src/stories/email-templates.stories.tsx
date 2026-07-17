import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { appConfig } from 'shared';

interface EmailPreviewArgs {
  name: string;
  lng: string;
  placeholders: boolean;
}

/** Renders backend-generated email HTML through Storybook's same-origin `/dev-emails` proxy. */
const EmailPreview = ({ name, lng, placeholders }: EmailPreviewArgs) => {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setHtml(null);
    setError(null);

    const url = `/dev-emails/${name}?lng=${lng}&placeholders=${placeholders ? '1' : '0'}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Backend responded ${res.status}`);
        return res.text();
      })
      .then((text) => active && setHtml(text))
      .catch((err) => active && setError(err.message));

    return () => {
      active = false;
    };
  }, [name, lng, placeholders]);

  if (error) {
    return (
      <div style={{ font: '14px system-ui, sans-serif', color: '#b00', padding: '1rem' }}>
        Could not load email preview: {error}.<br />
        Start the dev backend with <code>pnpm dev</code>.
      </div>
    );
  }

  if (html === null) return <div style={{ font: '14px system-ui, sans-serif', padding: '1rem' }}>Loading…</div>;

  return <iframe title={`${name} (${lng})`} srcDoc={html} style={{ width: '100%', height: '80vh', border: 0 }} />;
};

const meta = {
  title: 'Emails/Email templates',
  component: EmailPreview,
  tags: ['!test', '!autodocs'],
  parameters: {
    layout: 'fullscreen',
    chromatic: { disableSnapshot: true },
  },
  argTypes: {
    name: { table: { disable: true } },
    lng: { options: appConfig.languages, control: { type: 'radio' } },
    placeholders: { control: 'boolean' },
  },
  args: {
    lng: appConfig.languages[0],
    placeholders: false,
  },
} satisfies Meta<typeof EmailPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One story per backend email template. The `name` is fixed; lng/placeholders stay as controls. */
const makeEmailStory = (name: string): Story => ({ args: { name } });

export const AccountSecurity = makeEmailStory('account-security');
export const EmailVerification = makeEmailStory('email-verification');
export const OauthVerification = makeEmailStory('oauth-verification');
export const MagicLink = makeEmailStory('magic-link');
export const SystemInvite = makeEmailStory('system-invite');
export const MemberInvite = makeEmailStory('member-invite');
export const MemberInviteWithToken = makeEmailStory('member-invite-with-token');
export const MemberAdded = makeEmailStory('member-added');
export const Newsletter = makeEmailStory('newsletter');
export const RequestWasSent = makeEmailStory('request-was-sent');
export const RequestWasSentAdmin = makeEmailStory('request-was-sent-admin');
