import type { Meta, StoryObj } from '@storybook/react-vite';
import i18n from 'i18next';
import { hierarchy } from 'shared';
import { expect, spyOn, userEvent, waitFor, within } from 'storybook/test';
import { draftStore } from '~/modules/common/form-draft/draft-store';
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
 * a membership invite with one. The API knows the addresses in `parameters.known` as members or invited before; the
 * form checks addresses as they are added, and only the sends are recorded.
 */
const meta = {
  title: 'user/InviteUsers',
  component: InviteUsers,
  decorators: [withApp],
  parameters: { layout: 'centered', known: {} },
  render: (args) => (
    <div className="w-[32rem]">
      <InviteUsers {...args} />
    </div>
  ),
  beforeEach: ({ parameters }) => {
    requests.length = 0;
    draftStore.getState().reset();
    // Story tests run without the app's translations; these are the texts the plays read.
    i18n.addResourceBundle('en', 'c', {
      invite_count: 'Invite {{count}}',
      invite_group_member_one: '{{count}} already a member, left out',
      invite_result_invited: '{{count}} invited',
      invite_result_member: '{{email}} is already a member.',
    });
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const body = await request.json();
      const url = new URL(request.url);
      const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

      const known: Record<string, 'member' | 'remind'> = parameters.known;
      const outcomes = body.emails.map((email: string) => ({ email, outcome: known[email] ?? 'invite' }));
      if (url.pathname.endsWith('/memberships/check')) return json({ outcomes });

      requests.push({ path: url.pathname, search: url.search, body });
      if (url.pathname.endsWith('/system/invite')) return json({ data: [], rejectedIds: [], invitesSentCount: body.emails.length });
      return json({ data: [], outcomes, held: false });
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
    await userEvent.click(canvas.getByRole('button', { name: /^invite/i }));

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
  parameters: { known: { 'b@x.com': 'member' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('radiogroup')).toBeInTheDocument();
    await userEvent.type(canvas.getByRole('textbox'), 'a@x.com{Enter}b@x.com{Enter}');
    // The member is checked and left out of the count
    await waitFor(() => expect(canvas.getByRole('button', { name: /^invite/i })).toHaveTextContent(i18n.t('c:invite_count', { count: 1 })));
    await userEvent.click(canvas.getByRole('button', { name: /^invite/i }));

    await waitFor(() =>
      expect(toaster.success).toHaveBeenCalledWith(i18n.t('c:invite_result_invited', { count: 1 }), {
        description: i18n.t('c:invite_result_member', { email: 'b@x.com' }),
      }),
    );
    await expect(toaster.info).not.toHaveBeenCalled();
    await expect(requests).toEqual([
      {
        path: expect.stringMatching(/\/tenant-1\/org-1\/memberships$/),
        search: '?entityId=org-1&entityType=organization',
        body: { emails: ['a@x.com', 'b@x.com'], role: hierarchy.getLeastPrivilegedRole('organization') },
      },
    ]);
  },
};

export const ShouldCountChips: Story = {
  name: 'when chips are added, should show their count on the invite button',
  tags: playTags,
  args: { mode: 'email' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByRole('textbox'), 'a@x.com{Enter}b@x.com{Enter}c@x.com{Enter}');
    await expect(canvas.getByRole('button', { name: /^invite/i })).toHaveTextContent('3');

    await userEvent.keyboard('{Backspace}');
    await expect(canvas.getByRole('button', { name: /^invite/i })).toHaveTextContent('2');
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
    await userEvent.click(canvas.getByRole('button', { name: /^invite/i }));

    await expect(await canvas.findByText('Next step content')).toBeVisible();
    await expect(requests).toHaveLength(1);
  },
};

export const ShouldSendBulkInvite: Story = {
  name: 'when text with addresses is pasted in the bulk form, should invite the addresses it holds',
  tags: playTags,
  args: { mode: 'bulk', channel },
  parameters: { known: { 'b@x.com': 'member' } },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole('textbox');
    const submit = canvas.getByRole('button', { name: /^invite/i });

    await step('submit stays disabled until the text holds an address', async () => {
      await expect(submit).toBeDisabled();
      await userEvent.type(textarea, 'no addresses here');
      await expect(submit).toBeDisabled();
      await userEvent.clear(textarea);
    });

    await step('the addresses are extracted, lowercased and deduplicated, and the member is grouped apart', async () => {
      await userEvent.click(textarea);
      await userEvent.paste('Team: a@x.com; B@X.com\nalso a@x.com, and not-an-address');
      await expect(submit).toBeEnabled();
      await expect(await canvas.findByText(i18n.t('c:invite_group_member', { count: 1 }))).toBeVisible();
      await expect(submit).toHaveTextContent(i18n.t('c:invite_count', { count: 1 }));
    });

    await step('a sent invite clears the text and says the member was left out', async () => {
      await userEvent.click(submit);
      await waitFor(() =>
        expect(toaster.success).toHaveBeenCalledWith(i18n.t('c:invite_result_invited', { count: 1 }), {
          description: i18n.t('c:invite_result_member', { email: 'b@x.com' }),
        }),
      );
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
    await expect(canvas.getByRole('button', { name: /^invite/i })).toBeDisabled();
  },
};
