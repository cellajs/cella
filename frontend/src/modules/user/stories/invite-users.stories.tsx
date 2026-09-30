import type { Meta, StoryObj } from '@storybook/react-vite';
import i18n from 'i18next';
import { hierarchy } from 'shared';
import { expect, spyOn, userEvent, waitFor, within } from 'storybook/test';
import { useDraftStore } from '~/modules/common/form-draft/draft-store';
import { Step, Stepper } from '~/modules/common/stepper/stepper';
import { toaster } from '~/modules/common/toaster/toaster';
import type { EnrichedChannel } from '~/modules/entities/types';
// Registers the organization query keys a membership invite updates, as the app does at boot.
import '~/modules/organization/query';
import { InviteUsers } from '~/modules/user/invite-users';
import { withApp } from '~/stories/with-app';

// An app's channel type can carry more fields; the invite forms read only these.
const channel = {
  id: 'org-1',
  name: 'Organization',
  slug: 'organization',
  tenantId: 'tenant-1',
  entityType: 'organization',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: null,
  thumbnailUrl: null,
  bannerUrl: null,
} as EnrichedChannel;

/** Invite requests the stories sent, as the API received them. */
const requests: { path: string; search: string; body: { emails: string[]; role?: string } }[] = [];

/**
 * The invite forms: one address per chip or a pasted text block, sent as a system invite without a channel and as
 * a membership invite with one. The API answers with `parameters.rejected` of the addresses rejected.
 */
const meta = {
  title: 'user/InviteUsers',
  component: InviteUsers,
  decorators: [withApp],
  parameters: { layout: 'centered', rejected: 0 },
  render: (args) => (
    <div className="w-[32rem]">
      <InviteUsers {...args} />
    </div>
  ),
  beforeEach: ({ parameters }) => {
    requests.length = 0;
    useDraftStore.getState().reset();
    i18n.addResourceBundle('en', 'c', { still_not_accepted: '{{count}} of {{total}} not accepted' });

    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const body = await request.json();
      const url = new URL(request.url);
      requests.push({ path: url.pathname, search: url.search, body });

      const rejected: number = parameters.rejected;
      const rejectedIds = Array.from({ length: rejected }, (_, index) => `rejected-${index}`);
      const response = { data: [], rejectedIds, invitesSentCount: body.emails.length - rejected };
      return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } });
    });
    const success = spyOn(toaster, 'success');
    const info = spyOn(toaster, 'info');

    return () => {
      for (const spy of [fetchSpy, success, info]) spy.mockRestore();
      i18n.removeResourceBundle('en', 'c');
    };
  },
} satisfies Meta<typeof InviteUsers>;

export default meta;
type Story = StoryObj<typeof meta>;

const playTags = ['!dev', '!autodocs'];

export const EmailForm: Story = { args: { mode: 'email' } };

export const BulkForm: Story = { args: { mode: 'bulk', channel } };

export const ShouldSendSystemInvite: Story = {
  name: 'when emails are invited without a channel, should send a system invite',
  tags: playTags,
  args: { mode: 'email' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.queryByRole('radiogroup')).not.toBeInTheDocument();
    await userEvent.type(canvas.getByRole('textbox'), 'a@x.com{Enter}b@x.com{Enter}');
    await userEvent.click(canvas.getByRole('button', { name: /invite$/i }));

    await waitFor(() => expect(toaster.success).toHaveBeenCalledTimes(1));
    await expect(requests).toEqual([
      expect.objectContaining({
        path: expect.stringMatching(/\/system\/invite$/),
        body: expect.objectContaining({ emails: ['a@x.com', 'b@x.com'] }),
      }),
    ]);
    await expect(toaster.info).not.toHaveBeenCalled();
  },
};

export const ShouldSendMembershipInvite: Story = {
  name: 'when emails are invited to a channel, should send a membership invite with the role',
  tags: playTags,
  args: { mode: 'email', channel },
  parameters: { rejected: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('radiogroup')).toBeInTheDocument();
    await userEvent.type(canvas.getByRole('textbox'), 'a@x.com{Enter}b@x.com{Enter}');
    await userEvent.click(canvas.getByRole('button', { name: /invite$/i }));

    await waitFor(() => expect(toaster.info).toHaveBeenCalledWith('1 of 2 not accepted'));
    await expect(toaster.success).toHaveBeenCalledTimes(1);
    await expect(requests).toEqual([
      {
        path: expect.stringMatching(/\/tenant-1\/org-1\/memberships$/),
        search: '?entityId=org-1&entityType=organization',
        body: { emails: ['a@x.com', 'b@x.com'], role: hierarchy.getLeastPrivilegedRole('organization') },
      },
    ]);
  },
};

export const ShouldCancelEmailForm: Story = {
  name: 'when the email form is cancelled, should clear the chips',
  tags: playTags,
  args: { mode: 'email' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    await userEvent.type(canvas.getByRole('textbox'), 'a@x.com{Enter}');
    await userEvent.click(await canvas.findByRole('button', { name: /cancel/i }));

    await expect(canvas.queryByText('a@x.com')).not.toBeInTheDocument();
    await expect(requests).toEqual([]);
  },
};

/** Onboarding renders the email form in a step and passes its own footer as children. */
export const ShouldAdvanceStepper: Story = {
  name: 'when an invite inside a stepper succeeds, should move to the next step',
  tags: playTags,
  render: () => (
    <div className="w-[32rem]">
      <Stepper
        initialStep={0}
        steps={[
          { id: 'invite', label: 'Invite' },
          { id: 'done', label: 'Done' },
        ]}
      >
        <Step label="Invite">
          <InviteUsers mode="email">
            <span>Step footer</span>
          </InviteUsers>
        </Step>
        <Step label="Done">
          <p>Next step content</p>
        </Step>
      </Stepper>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText('Step footer')).toBeInTheDocument();
    await userEvent.type(canvas.getByRole('textbox'), 'a@x.com{Enter}');
    await expect(canvas.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: /invite$/i }));

    await expect(await canvas.findByText('Next step content')).toBeVisible();
    await expect(requests).toHaveLength(1);
  },
};

export const ShouldSendBulkInvite: Story = {
  name: 'when text with addresses is pasted in the bulk form, should invite the addresses it holds',
  tags: playTags,
  args: { mode: 'bulk', channel },
  parameters: { rejected: 1 },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole('textbox');
    const submit = canvas.getByRole('button', { name: /invite$/i });

    await step('submit stays disabled until the text holds an address', async () => {
      await expect(submit).toBeDisabled();
      await userEvent.type(textarea, 'no addresses here');
      await expect(submit).toBeDisabled();
      await userEvent.clear(textarea);
    });

    await step('the addresses are extracted, lowercased and deduplicated', async () => {
      await userEvent.click(textarea);
      await userEvent.paste('Team: a@x.com; B@X.com\nalso a@x.com, and not-an-address');
      await expect(submit).toBeEnabled();
      await expect(submit).toHaveTextContent('2');
    });

    await step('a sent invite clears the text and counts rejections against the sent addresses', async () => {
      await userEvent.click(submit);
      await waitFor(() => expect(toaster.info).toHaveBeenCalledWith('1 of 2 not accepted'));
      await expect(requests).toEqual([
        expect.objectContaining({
          path: expect.stringMatching(/\/tenant-1\/org-1\/memberships$/),
          body: { emails: ['a@x.com', 'b@x.com'], role: hierarchy.getLeastPrivilegedRole('organization') },
        }),
      ]);
      await expect(textarea).toHaveValue('');
      await expect(submit).toBeDisabled();
    });
  },
};

export const ShouldCancelBulkForm: Story = {
  name: 'when the bulk form is cancelled, should clear the text',
  tags: playTags,
  args: { mode: 'bulk' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole('textbox');

    await userEvent.type(textarea, 'a@x.com');
    await userEvent.click(await canvas.findByRole('button', { name: /cancel/i }));

    await expect(textarea).toHaveValue('');
    await expect(canvas.getByRole('button', { name: /invite$/i })).toBeDisabled();
  },
};
