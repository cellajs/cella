import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { BlockNote } from '~/modules/common/blocknote/blocknote-editor';
import { DescriptionLayers } from '~/modules/common/blocknote/description-layers';
import { BlockNoteFullHtml } from '~/modules/common/blocknote/full-html';
import { useDescriptionSlot } from '~/modules/common/blocknote/use-description-slot';
import { withApp } from '~/stories/with-app';

const text = (value: string) => [{ type: 'text', text: value, styles: {} }];
const blockProps = { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' };
const checklistItem = (checkboxId: string, value: string, checked: boolean) => ({
  id: checkboxId,
  type: 'checklistItem',
  props: { textColor: 'default', textAlignment: 'left', checkboxId, checked },
  content: text(value),
  children: [],
});

const sampleDocument = JSON.stringify([
  { id: 'title', type: 'heading', props: { ...blockProps, level: 3, isToggleable: false }, content: text('Launch checklist'), children: [] },
  {
    id: 'intro',
    type: 'paragraph',
    props: blockProps,
    content: text('Hover to warm the editor, click this text to edit, press Escape to leave.'),
    children: [],
  },
  checklistItem('copy', 'Write the release notes', true),
  checklistItem('review', 'Review the screenshots', false),
]);

/** Delay before a resting pointer warms the editor, so a pointer passing over warms nothing. */
const hoverWarmMs = 200;

/**
 * One description slot over a sample document, its editor standalone since Storybook has no relay. The app part is
 * what each app writes: it owns `editing`, warms on hover and leaves editing on Escape.
 */
function DescriptionSlotDemo() {
  // The cache: the editor's commits write it, and the static renders it.
  const [description, setDescription] = useState(sampleDocument);
  const [editing, setEditing] = useState(false);
  const slot = useDescriptionSlot({ editing, canEdit: true, description, cursorAtPoint: true });
  const hoverTimer = useRef(0);

  const state = editing ? 'editing' : slot.holding ? 'holding' : slot.editorMounted ? 'warm' : 'static';

  return (
    <div className="w-xl">
      <p className="mb-2 text-muted-foreground text-xs">
        State: <span data-testid="slot-state">{state}</span>
      </p>
      <DescriptionLayers
        slot={slot}
        data-testid="slot"
        className="min-h-8 rounded-md border p-3"
        onMouseEnter={() => {
          hoverTimer.current = window.setTimeout(() => slot.warm('hover'), hoverWarmMs);
        }}
        onMouseLeave={() => {
          clearTimeout(hoverTimer.current);
          slot.cool('hover');
        }}
        onClick={() => setEditing(true)}
        staticView={<BlockNoteFullHtml id="description-slot-static" defaultValue={slot.staticOverride ?? description} onReady={slot.onStaticReady} />}
        editor={
          <BlockNote
            id="description-slot-editor"
            defaultValue={description}
            updateData={setDescription}
            contentApiRef={slot.apiRef}
            onEditorReady={slot.onEditorReady}
            onEscapeClick={() => setEditing(false)}
            sideMenu={false}
            dense
          />
        }
      />
    </div>
  );
}

/** The lifecycle of a description shown in place: `useDescriptionSlot` with `<DescriptionLayers>`. */
const meta = {
  title: 'common/blocknote/DescriptionSlot',
  component: DescriptionSlotDemo,
  decorators: [withApp],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof DescriptionSlotDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The static view; the warm editor behind it renders the same text. */
const staticView = (canvasElement: HTMLElement) => within(canvasElement.querySelector('#description-slot-static') as HTMLElement);

/** The checkbox the static renders for a checklist item. */
const staticCheckbox = (canvasElement: HTMLElement, checkboxId: string) =>
  canvasElement.querySelector<HTMLInputElement>(`#description-slot-static input[data-checkbox-id="${checkboxId}"]`);

/** Hover warms the editor, a checkbox on the static toggles through it, a text click edits, Escape leaves. */
export const Lifecycle: Story = {
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const state = () => canvas.getByTestId('slot-state').textContent;

    await waitFor(() => expect(staticView(canvasElement).getByText('Launch checklist')).toBeVisible());
    await expect(state()).toBe('static');

    await step('hover warms the editor behind the static', async () => {
      await userEvent.hover(canvas.getByTestId('slot'));
      await waitFor(() => expect(state()).toBe('warm'));
      await waitFor(() => expect(canvasElement.querySelector('.bn-editor')).not.toBeNull());
    });

    await step('a checkbox on the static toggles through the editor', async () => {
      await expect(staticCheckbox(canvasElement, 'review')).not.toBeChecked();
      // The static renders its checkbox disabled, so the click goes to the wrapper.
      await userEvent.click(staticCheckbox(canvasElement, 'review')?.closest('.checklist-checkbox-wrapper') as HTMLElement);
      await waitFor(() => expect(staticCheckbox(canvasElement, 'review')).toBeChecked());
      await expect(state()).toBe('warm');
    });

    await step('a text click edits with the cursor at the click', async () => {
      await userEvent.click(staticView(canvasElement).getByText(/click this text to edit/));
      await waitFor(() => expect(state()).toBe('editing'));
      await waitFor(() => expect(document.activeElement?.closest('.bn-editor')).not.toBeNull());
    });

    await step('Escape hands off to the static', async () => {
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(state()).toBe('warm'));
      await expect(staticView(canvasElement).getByText('Launch checklist')).toBeVisible();
      await expect(staticCheckbox(canvasElement, 'review')).toBeChecked();
    });
  },
};
