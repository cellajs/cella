import type { Meta, StoryObj } from '@storybook/react-vite';
import type { MembershipBase } from 'sdk';
import { appConfig, hierarchy } from 'shared';
import { expect, within } from 'storybook/test';
import {
  ChannelTile,
  ChannelTileBanner,
  ChannelTileCard,
  ChannelTileDescription,
  ChannelTileFooter,
  ChannelTileHeading,
  ChannelTileMembers,
  ChannelTileMembership,
  ChannelTileParentChip,
  ChannelTileRow,
  ChannelTileStats,
} from '~/modules/entities/entity-grid';
import type { ChannelTileEntity } from '~/modules/entities/types';
import { Button } from '~/modules/ui/button';
import { withApp } from '~/stories/with-app';

/** The app's organization roles: previews show the most privileged, the stats count the least privileged. */
const mostPrivileged = hierarchy.getMostPrivilegedRole('organization');
const leastPrivileged = hierarchy.getLeastPrivilegedRole('organization');
// The tile counts the app's member-stat products, so the stories post what the app counts
const postType = appConfig.memberStatProductTypes[0];

const previews = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing'].map((name, index) => ({ id: `user-${index}`, name, thumbnailUrl: null }));

/** A row as a list answers it with `include=counts,members`: the counts and the previews of the most privileged role. */
const organization: ChannelTileEntity = {
  id: 'org-1',
  entityType: 'organization',
  tenantId: 'tenant-1',
  slug: 'northwind',
  name: 'Northwind',
  createdAt: '2026-01-10T09:00:00Z',
  updatedAt: null,
  thumbnailUrl: null,
  bannerUrl: null,
  publishedAt: '2026-01-10T09:00:00Z',
  included: {
    counts: {
      membership: { [mostPrivileged]: 7, [leastPrivileged]: 41, pending: 2, total: 48 },
      entities: { [postType]: 12 },
      activity: { [postType]: { created: Date.parse('2026-10-01T12:00:00Z') } },
    },
    members: previews,
  },
};

const adminMembership = { role: mostPrivileged } as MembershipBase;
const parent = { ...organization, id: 'org-parent', slug: 'contoso', name: 'Contoso' };

/** The channel grid tile. Each part reads the row from `ChannelTileCard`; a module composes its own tile from them or renders the default. */
const meta = {
  title: 'entities/ChannelTile',
  component: ChannelTile,
  decorators: [
    withApp,
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'padded' },
  args: { entity: organization },
} satisfies Meta<typeof ChannelTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('link', { name: /Northwind/ })).toBeInTheDocument();
    // Three previews of the seven most privileged members
    await expect(canvas.getByText('+4')).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: /leave/ })).toBeNull();
  },
};

export const Joined: Story = {
  args: { entity: { ...organization, membership: adminMembership } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: /leave/ })).toBeInTheDocument();
  },
};

/** On another user's profile the viewer's own membership stays out of the tile. */
export const OfAnotherUser: Story = {
  args: { entity: { ...organization, membership: adminMembership }, hideOwnRole: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: /leave/ })).toBeNull();
  },
};

export const Invited: Story = {
  args: { entity: { ...organization, invited: true } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('pending')).toBeInTheDocument();
  },
};

export const Draft: Story = {
  args: { entity: { ...organization, publishedAt: null } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('draft')).toBeInTheDocument();
  },
};

/** Counts from a thousand up are compact, as in the table count columns, the +N bubble on the banner included. */
export const LargeCounts: Story = {
  args: {
    entity: {
      ...organization,
      included: {
        members: previews,
        counts: {
          membership: { [mostPrivileged]: 1203, [leastPrivileged]: 1407, pending: 2, total: 2610 },
          entities: { [postType]: 21_312 },
          activity: { [postType]: { created: Date.parse('2026-10-01T12:00:00Z') } },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText(/^2\.6k members?$/i)).toBeInTheDocument();
    await expect(canvas.getByText('+1.2k')).toBeInTheDocument();
    await expect(canvas.getByText(/^21k/)).toBeInTheDocument();
    await expect(canvas.queryByText(/2610|1200|21312/)).toBeNull();
  },
};

/** A module's own tile: a counted role, a parent chip, a description and a join action for non-members. */
export const Composed: Story = {
  args: { entity: { ...organization, description: '<p>Supplies <b>everything</b> &amp; more.</p>' } },
  render: ({ entity }) => (
    <ChannelTileCard entity={entity}>
      <ChannelTileBanner
        overlay={
          <>
            <ChannelTileMembers />
            <ChannelTileParentChip parent={parent} />
          </>
        }
      >
        <ChannelTileHeading meta={<ChannelTileStats countRole={leastPrivileged} />} />
      </ChannelTileBanner>
      <ChannelTileFooter>
        <ChannelTileDescription />
        <ChannelTileMembership fallback={<Button variant="outline">Join</Button>} />
      </ChannelTileFooter>
    </ChannelTileCard>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('link', { name: /in_channel/ })).toBeInTheDocument();
    await expect(canvas.getByText('Supplies everything & more.')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Join' })).toBeInTheDocument();
  },
};

/** A banner-less row whose avatar and meta line come from the module, such as a container listing its child channels. */
export const Compact: Story = {
  render: ({ entity }) => (
    <ChannelTileCard entity={entity}>
      <ChannelTileRow>
        <ChannelTileHeading
          leading={<div className="flex size-10 items-center justify-center rounded-md border text-xs">3</div>}
          meta={<span className="truncate text-muted-foreground text-sm">Roadmap, Website, Support</span>}
        />
      </ChannelTileRow>
    </ChannelTileCard>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('link', { name: /Northwind/ })).toBeInTheDocument();
    await expect(canvas.getByText('Roadmap, Website, Support')).toBeInTheDocument();
  },
};
