import type { Meta, StoryObj } from '@storybook/react-vite';
import i18n from 'i18next';
import { hierarchy } from 'shared';
import { expect, spyOn, userEvent, waitFor, within } from 'storybook/test';
import { draftStore } from '~/modules/common/form-draft/draft-store';
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
 * The invite forms: one address at a time or a pasted text block, sent as a system invite without a channel and as
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
      invite_add_to_list: 'Add to list',
      invite_already_listed: '{{address}} is already in the list.',
      invite_result_invited: '{{count}} invited',
      invite_state_not_address: 'Not an address',
      invite_summary_fix: '{{count}} to fix',
      invite_summary_new: '{{count}} new',
      invite_summary_new_role: '{{count}} new {{role, lowercase}}',
      invite_summary_out: '{{count}} left out',
      join_as: 'Join as',
    });
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const body = await request.json();
      const url = new URL(request.url);
      const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

      const known: Record<string, 'member' | 'resend'> = parameters.known;
      const outcomes = body.emails.map((email: string) => ({ email, outcome: known[email] ?? 'invite' }));
      if (url.pathname.endsWith('/members:check-invite')) return json({ outcomes });

      requests.push({ path: url.pathname, search: url.search, body });
      if (url.pathname.endsWith('/users:invite')) return json({ results: [], rejectedIds: [], invitationCount: body.emails.length });
      return json({ results: [], outcomes, held: false });
    });
    const success = spyOn(toaster, 'success');

    return () => {
      for (const spy of [fetchSpy, success]) spy.mockRestore();
      i18n.removeResourceBundle('en', 'c');
    };
  },
} satisfies Meta<typeof InviteUsers>;

export default meta;
type Story = StoryObj<typeof meta>;

const playTags = ['!dev', '!autodocs'];

/** A tile summary whose count changed rolls in from opacity 0, so the check waits until it shows. */
const expectSummaryShown = (canvasElement: HTMLElement, text: string) => waitFor(() => expect(within(canvasElement).getByText(text)).toBeVisible());

export const Chooser: Story = { args: { channel } };

export const EmailForm: Story = { args: { mode: 'email' } };

export const BulkForm: Story = { args: { mode: 'bulk', channel } };

export const ShouldMoveTypedAddressBelow: Story = {
  name: 'when an address is typed, Enter, a separator or leaving the field should move it below and clear the field',
  tags: playTags,
  args: { mode: 'email' },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox');

    await step('Enter and each separator add a whole address, and Enter never submits', async () => {
      await userEvent.type(input, 'a@x.com{Enter}b@x.com,c@x.com;d@x.com {Enter}');
      await expect(input).toHaveValue('');
      await expectSummaryShown(canvasElement, i18n.t('c:invite_summary_new', { count: 4 }));
      await expect(requests).toEqual([]);
    });

    await step('a partial address stays in the field, marked', async () => {
      await userEvent.type(input, 'jan@bartoletti{Enter}');
      await expect(input).toHaveValue('jan@bartoletti');
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(canvas.getByText(i18n.t('c:invite_state_not_address'))).toBeVisible();
      await userEvent.clear(input);
    });

    await step('a repeat in any case is named and not added', async () => {
      await userEvent.type(input, 'A@X.COM{Enter}');
      await expect(canvas.getByText(i18n.t('c:invite_already_listed', { address: 'a@x.com' }))).toBeVisible();
      await expect(canvas.getByText(i18n.t('c:invite_summary_new', { count: 4 }))).toBeVisible();
    });

    await step('leaving the field adds what it holds', async () => {
      await userEvent.type(input, 'blur@x.com');
      await userEvent.tab();
      await expectSummaryShown(canvasElement, i18n.t('c:invite_summary_new', { count: 5 }));
    });
  },
};

export const ShouldKeepEveryPastedAddress: Story = {
  name: 'when text is pasted in the email field, should add each address and name what it could not read',
  tags: playTags,
  args: { mode: 'email' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox');

    await userEvent.click(input);
    await userEvent.paste('a@x.com, b@x.com; nope@x');
    await expect(input).toHaveValue('');
    await expectSummaryShown(canvasElement, i18n.t('c:invite_summary_new', { count: 2 }));
    await expect(canvas.getByText(i18n.t('c:invite_summary_fix', { count: 1 }))).toBeVisible();

    // An address typed before a paste stays whole
    await userEvent.keyboard('typed@x.com');
    await userEvent.paste('pasted@x.com');
    await expectSummaryShown(canvasElement, i18n.t('c:invite_summary_new', { count: 4 }));
  },
};

export const ShouldInviteAddressStillInField: Story = {
  name: 'when Invite is pressed with a whole address still in the field, should send it too',
  tags: playTags,
  args: { mode: 'email' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByRole('textbox'), 'only@x.com');
    await userEvent.click(canvas.getByRole('button', { name: /^invite/i }));

    await waitFor(() => expect(toaster.success).toHaveBeenCalledTimes(1), { timeout: 5000 });
    await expect(requests).toEqual([expect.objectContaining({ body: expect.objectContaining({ emails: ['only@x.com'] }) })]);
  },
};

export const ShouldSendSystemInvite: Story = {
  name: 'when emails are invited without a channel, should send a system invite',
  tags: playTags,
  args: { mode: 'email' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.queryByText('Join as')).not.toBeInTheDocument();
    await userEvent.type(canvas.getByRole('textbox'), 'a@x.com{Enter}b@x.com{Enter}');
    await userEvent.click(canvas.getByRole('button', { name: /^invite/i }));

    // The file's first play pays for its cold start, which in a full parallel run outlasts the default second.
    await waitFor(() => expect(toaster.success).toHaveBeenCalledTimes(1), { timeout: 5000 });
    await expect(requests).toEqual([
      expect.objectContaining({
        path: expect.stringMatching(/\/users:invite$/),
        body: expect.objectContaining({ emails: ['a@x.com', 'b@x.com'] }),
      }),
    ]);
  },
};

export const ShouldSendMembershipInvite: Story = {
  name: 'when emails are invited to a channel, should send a membership invite with the role',
  tags: playTags,
  args: { mode: 'email', channel },
  parameters: { known: { 'b@x.com': 'member' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText('Join as')).toBeInTheDocument();
    await userEvent.type(canvas.getByRole('textbox'), 'a@x.com{Enter}b@x.com{Enter}');
    // The member is checked and left out of what goes out
    await expectSummaryShown(canvasElement, i18n.t('c:invite_summary_out', { count: 1 }));
    await userEvent.click(canvas.getByRole('button', { name: /^invite/i }));

    // The toast does not repeat the member the list showed as left out before the send
    await waitFor(() => expect(toaster.success).toHaveBeenCalledWith(i18n.t('c:invite_result_invited', { count: 1 }), undefined), { timeout: 5000 });
    await expect(requests).toEqual([
      {
        path: expect.stringMatching(/\/tenants\/tenant-1\/organizations\/org-1\/members:invite$/),
        search: '?entityId=org-1&entityType=organization',
        body: { emails: ['a@x.com', 'b@x.com'], role: hierarchy.getLeastPrivilegedRole('organization') },
      },
    ]);
  },
};

export const ShouldCancelEmailForm: Story = {
  name: 'when the email form is cancelled, should clear the list',
  tags: playTags,
  args: { mode: 'email' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    await userEvent.type(canvas.getByRole('textbox'), 'a@x.com{Enter}');
    await userEvent.click(await canvas.findByRole('button', { name: /cancel/i }));

    await expect(canvas.queryByText(i18n.t('c:invite_summary_new', { count: 1 }))).not.toBeInTheDocument();
    await expect(requests).toEqual([]);
  },
};

export const ShouldSendBulkInvite: Story = {
  name: 'when text with addresses is pasted in the bulk form, should keep it until Add moves the addresses below, then invite them',
  tags: playTags,
  args: { mode: 'bulk', channel },
  parameters: { known: { 'b@x.com': 'member' } },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole('textbox');

    await step('a paste and leaving the box move nothing', async () => {
      await userEvent.click(textarea);
      await userEvent.paste('Team: a@x.com; B@X.com\nalso a@x.com, and not-an-address');
      await userEvent.tab();
      await expect(textarea).not.toHaveValue('');
      await expect(canvas.queryByText(i18n.t('c:invite_summary_out', { count: 2 }))).not.toBeInTheDocument();
    });

    await step('Add extracts the addresses, lowercased and deduplicated, and counts what holds no address', async () => {
      await userEvent.click(canvas.getByRole('button', { name: i18n.t('c:invite_add_to_list') }));
      await expect(textarea).toHaveValue('');
      await expectSummaryShown(canvasElement, i18n.t('c:invite_summary_out', { count: 2 }));
    });

    await step('a sent invite closes on a toast that leaves out what the list already showed', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /^invite/i }));
      await waitFor(() => expect(toaster.success).toHaveBeenCalledWith(i18n.t('c:invite_result_invited', { count: 1 }), undefined), {
        timeout: 5000,
      });
      await expect(requests).toEqual([
        expect.objectContaining({
          path: expect.stringMatching(/\/tenants\/tenant-1\/organizations\/org-1\/members:invite$/),
          body: { emails: ['a@x.com', 'b@x.com'], role: hierarchy.getLeastPrivilegedRole('organization') },
        }),
      ]);
    });
  },
};

export const ShouldCheckTypedBulkText: Story = {
  name: 'when Invite is pressed with typed text in the bulk box, should move it below and send nothing yet',
  tags: playTags,
  args: { mode: 'bulk' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByRole('textbox'), 'a@x.com{Meta>}{Enter}{/Meta}');
    await expectSummaryShown(canvasElement, i18n.t('c:invite_summary_new', { count: 1 }));
    await userEvent.type(canvas.getByRole('textbox'), 'b@x.com');
    await userEvent.click(canvas.getByRole('button', { name: /^invite/i }));

    await expectSummaryShown(canvasElement, i18n.t('c:invite_summary_new', { count: 2 }));
    await expect(canvas.getByRole('textbox')).toHaveValue('');
    await expect(requests).toEqual([]);
  },
};
