import type { Meta, StoryObj } from '@storybook/react-vite';
import { appConfig } from 'shared';
import { expect, within } from 'storybook/test';
import { AccountNotificationsCard } from '~/modules/notification/account-notifications-card';
import { notificationKeys } from '~/modules/notification/query';
import { withApp } from '~/stories/with-app';

const preferences = { mentionEmails: true, commentEmails: false, digest: 'weekly' };

/** The notification settings card: email switches and the digest cadence, over the stored preferences. */
const meta = {
  title: 'notification/AccountNotificationsCard',
  component: AccountNotificationsCard,
  decorators: [withApp],
  parameters: { layout: 'padded', app: { queryData: [[notificationKeys.preferences, preferences]] } },
} satisfies Meta<typeof AccountNotificationsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MentionEmailOnly: Story = {
  beforeEach: () => {
    const { commentEmails } = appConfig.has;
    appConfig.has.commentEmails = false;
    return () => {
      appConfig.has.commentEmails = commentEmails;
    };
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('switch', { name: /mention_email/ })).toBeChecked();
    // No send path reads the comment preference, so the app shows it only when its config turns it on.
    await expect(canvas.queryByRole('switch', { name: /comment_email/ })).toBeNull();
    // The seeded cadence owns its tile. i18next runs without resources here, so the name is the bare key.
    await expect(await canvas.findByRole('radio', { name: /digest_weekly/ })).toBeChecked();
  },
};

export const WithCommentEmail: Story = {
  beforeEach: () => {
    const { commentEmails } = appConfig.has;
    appConfig.has.commentEmails = true;
    return () => {
      appConfig.has.commentEmails = commentEmails;
    };
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('switch', { name: /comment_email/ })).not.toBeChecked();
  },
};
