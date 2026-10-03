import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { BlockNoteFullHtml } from '~/modules/common/blocknote/full-html';
import { Badge } from '~/modules/ui/badge';
import { withApp } from '~/stories/with-app';

const blockProps = { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' };

/** A one-block document, as `deriveDocument` stores a summary. */
const summary = (type: string, value: string, props: Record<string, unknown> = {}) =>
  JSON.stringify([{ id: 'summary', type, props: { ...blockProps, ...props }, content: [{ type: 'text', text: value, styles: {} }], children: [] }]);

const longSummary = 'Check the release notes against the changelog, then publish them to every channel that announced the previous release';

/** A summary followed by a badge, in a box narrow enough to wrap the text over several lines. */
function SummaryWithBadge({ document, inline }: { document: string; inline: boolean }) {
  return (
    <div className="w-72 rounded-md border p-3" data-testid="row">
      <BlockNoteFullHtml id="summary" defaultValue={document} dense inline={inline} />
      <Badge size="xs" variant="plain" className="ml-1 inline-flex" data-testid="badge">
        3
      </Badge>
    </div>
  );
}

/** The static render of a stored document: `BlockNoteFullHtml`. */
const meta = {
  title: 'common/blocknote/FullHtml',
  component: SummaryWithBadge,
  decorators: [withApp],
  parameters: { layout: 'centered' },
  args: { document: summary('paragraph', longSummary), inline: true },
} satisfies Meta<typeof SummaryWithBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The last line box of the summary's text and the badge's box. */
const lastLineAndBadge = (canvasElement: HTMLElement) => {
  const lines = (canvasElement.querySelector('.bn-inline-content') as HTMLElement).getClientRects();
  return { lines: lines.length, lastLine: lines[lines.length - 1], badge: within(canvasElement).getByTestId('badge').getBoundingClientRect() };
};

/** `inline` drops the block wrappers from the layout: the badge follows the last word of a wrapped summary. */
export const InlineSummary: Story = {
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByText(longSummary)).toBeVisible());
    const { lines, lastLine, badge } = lastLineAndBadge(canvasElement);

    await expect(lines).toBeGreaterThan(1);
    // On the last line and to the right of its text.
    await expect(badge.left).toBeGreaterThanOrEqual(lastLine.right);
    await expect(badge.top).toBeLessThan(lastLine.bottom);
    await expect(badge.bottom).toBeGreaterThan(lastLine.top);
  },
};

/** A heading as the summary block flows inline as well. */
export const InlineHeadingSummary: Story = {
  args: { document: summary('heading', longSummary, { level: 3, isToggleable: false }) },
  play: InlineSummary.play,
};

/** Without `inline` the document is a block, and what follows it starts below. */
export const BlockSummary: Story = {
  args: { inline: false },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByText(longSummary)).toBeVisible());
    const { lastLine, badge } = lastLineAndBadge(canvasElement);
    await expect(badge.top).toBeGreaterThanOrEqual(lastLine.bottom);
  },
};
