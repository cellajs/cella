import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef, useState } from 'react';
import { foldText, matchesTerms, parseTerms } from 'shared/utils/text-match';
import { expect, userEvent } from 'storybook/test';
import { HighlightText } from '~/modules/common/match-highlight/highlight-text';
import { MatchScope } from '~/modules/common/match-highlight/match-scope';
import { useMatchHighlight } from '~/modules/common/match-highlight/use-match-highlight';
import { useMatchSteps } from '~/modules/common/match-highlight/use-match-steps';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';

const people = ['Renée Bakker', 'Joost Kramer', 'Sanne de Vries', 'Mila Janssen'];
const documentHtml = '<p>Realtime <strong>sync</strong> drops updates after the laptop wakes. <em>Renée</em> and Sanne can reproduce it.</p>';

/** HTML the app does not render itself: painted by the Highlight API, no marks in the DOM. */
function StaticDocument() {
  const ref = useRef<HTMLDivElement>(null);
  useMatchHighlight(ref);
  // biome-ignore lint/security/noDangerouslySetInnerHtml: fixed story markup
  return <div ref={ref} className="rounded-md border p-3 text-sm" dangerouslySetInnerHTML={{ __html: documentHtml }} />;
}

function MatchHighlightDemo({ query: initialQuery }: { query: string }) {
  const [query, setQuery] = useState(initialQuery);
  const terms = parseTerms(query);
  const matching = people.filter((name) => matchesTerms([foldText(name)], terms));
  const steps = useMatchSteps(matching, () => {});

  return (
    <MatchScope terms={terms}>
      <div className="flex w-96 flex-col gap-3">
        <div className="flex items-center gap-2">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search" />
          <span data-testid="counter" className="whitespace-nowrap text-muted-foreground text-xs tabular-nums">
            {steps.index >= 0 ? `${steps.index + 1}/${steps.total}` : steps.total}
          </span>
          <Button variant="outline" size="sm" onClick={steps.previous}>
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={steps.next}>
            Next
          </Button>
        </div>
        <ul className="flex flex-col gap-1">
          {people.map((name) => (
            <li key={name} data-match-current={steps.currentId === name || undefined} className="rounded px-2 py-1 data-[match-current]:bg-accent">
              <HighlightText text={name} />
            </li>
          ))}
        </ul>
        <StaticDocument />
        <span className="sr-only" aria-live="polite">
          {steps.announcement}
        </span>
      </div>
    </MatchScope>
  );
}

const meta = {
  title: 'common/MatchHighlight',
  component: MatchHighlightDemo,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof MatchHighlightDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { query: 'an' } };

export const AccentInsensitive: Story = { args: { query: 'renee' } };

export const ShouldMarkMatchesAndStep: Story = {
  name: 'when a query matches, should wrap matches in marks and step through matching items',
  tags: ['!dev', '!autodocs'],
  args: { query: 'renee' },
  play: async ({ canvas, step }) => {
    await step('Accent-insensitive match is wrapped in a mark', async () => {
      const marks = await canvas.findAllByText('Renée', { selector: 'mark' });
      expect(marks).toHaveLength(1);
    });

    await step('Next marks the first matching item current', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
      expect(canvas.getByText('Renée', { selector: 'mark' }).closest('[data-match-current]')).not.toBeNull();
      expect(canvas.getByTestId('counter')).toHaveTextContent('1/1');
    });

    await step('A new query repaints', async () => {
      const input = canvas.getByLabelText('Search');
      await userEvent.clear(input);
      await userEvent.type(input, 'an');
      expect(canvas.getAllByText('an')).toHaveLength(2);
      expect(canvas.getByTestId('counter')).toHaveTextContent('2');
    });
  },
};
