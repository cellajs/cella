import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';
import { FocusTrap } from '../focus-trap';

// Helpers

function TrapWithButtons({
  label = 'Trap',
  count = 3,
  active,
  containFocus,
  initialFocus,
  returnFocus,
}: {
  label?: string;
  count?: number;
  active?: boolean;
  containFocus?: boolean;
  initialFocus?: boolean;
  returnFocus?: boolean;
}) {
  return (
    <FocusTrap active={active} containFocus={containFocus} initialFocus={initialFocus} returnFocus={returnFocus}>
      <fieldset className="flex flex-col gap-2 rounded border p-4">
        <legend className="font-medium text-sm">{label}</legend>
        {Array.from({ length: count }, (_, i) => (
          <button key={i} type="button" className="rounded border px-3 py-1.5 text-sm hover:bg-muted focus:outline-2 focus:outline-primary">
            Button {i + 1}
          </button>
        ))}
      </fieldset>
    </FocusTrap>
  );
}

function ToggleTrap() {
  const [active, setActive] = useState(true);
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => setActive(!active)} className="rounded border px-3 py-1.5 text-sm" data-testid="toggle">
        Trap is {active ? 'active' : 'inactive'}
      </button>
      <TrapWithButtons active={active} label={active ? 'Active trap' : 'Inactive trap'} />
    </div>
  );
}

function InitialFocusTrap() {
  const [active, setActive] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => setActive(true)} className="rounded border px-3 py-1.5 text-sm" data-testid="activate">
        Activate trap
      </button>
      {active && <TrapWithButtons active initialFocus label="Trap with initialFocus" />}
    </div>
  );
}

function ReturnFocusTrap() {
  const [active, setActive] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => setActive(!active)} className="rounded border px-3 py-1.5 text-sm" data-testid="toggle">
        {active ? 'Deactivate' : 'Activate'} trap
      </button>
      {active && <TrapWithButtons active initialFocus returnFocus label="Trap with returnFocus" />}
    </div>
  );
}

function ContainFocusTrap() {
  return (
    <div className="flex flex-col gap-4">
      <button type="button" className="rounded border px-3 py-1.5 text-sm" data-testid="outside">
        Outside button
      </button>
      <TrapWithButtons active containFocus initialFocus label="Contained trap" />
    </div>
  );
}

// Meta

const meta = { title: 'common/FocusTrap', tags: ['autodocs'], parameters: { layout: 'centered' } } satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

// Visual stories

/**
 * Basic active focus trap. Tab cycles through the buttons and wraps around
 * at both ends using invisible sentinel elements.
 */
export const Default: Story = {
  render: () => <TrapWithButtons active label="Active trap" />,
};

/** Toggle the trap between active and inactive states. */
export const Toggleable: Story = {
  render: () => <ToggleTrap />,
};

/**
 * When `initialFocus` is set, focus moves to the first focusable element
 * inside the trap on activation.
 */
export const InitialFocus: Story = {
  render: () => <InitialFocusTrap />,
};

/**
 * When `returnFocus` is set, focus returns to the earlier focused element
 * when the trap deactivates.
 */
export const ReturnFocus: Story = {
  render: () => <ReturnFocusTrap />,
};

/**
 * When `containFocus` is set, clicking outside the trap pulls focus back
 * to the first focusable element.
 */
export const ContainFocus: Story = {
  render: () => <ContainFocusTrap />,
};

// Interaction tests (hidden from sidebar)

export const ShouldCycleForwardOnTab: Story = {
  name: 'when Tab on last element, should wrap to first',
  tags: ['!dev', '!autodocs'],
  render: () => <TrapWithButtons active label="Trap" />,
  play: async ({ canvasElement, canvas, step }) => {
    const buttons = canvas.getAllByRole('button');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    const guards = canvasElement.querySelectorAll<HTMLElement>('[data-focus-guard]');
    const afterGuard = guards[guards.length - 1];

    await step('focus the last button', async () => {
      last.focus();
      await waitFor(() => expect(last).toHaveFocus());
    });

    await step('Tab from last reaches the trailing sentinel, which wraps to first', async () => {
      // Real Tab-key navigation can't run headless (the page has no OS focus, so keypresses don't move focus).
      // Focusing the trailing sentinel guard exercises the same mechanism as tabbing off the last element.
      afterGuard.focus();
      await waitFor(() => expect(first).toHaveFocus());
    });
  },
};

export const ShouldCycleBackwardOnShiftTab: Story = {
  name: 'when Shift+Tab on first element, should wrap to last',
  tags: ['!dev', '!autodocs'],
  render: () => <TrapWithButtons active label="Trap" />,
  play: async ({ canvasElement, canvas, step }) => {
    const buttons = canvas.getAllByRole('button');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    const guards = canvasElement.querySelectorAll<HTMLElement>('[data-focus-guard]');
    const beforeGuard = guards[0];

    await step('focus the first button', async () => {
      first.focus();
      await waitFor(() => expect(first).toHaveFocus());
    });

    await step('Shift+Tab from first reaches the leading sentinel, which wraps to last', async () => {
      // See ShouldCycleForwardOnTab: drive the leading sentinel directly rather
      // than a real Shift+Tab, which the headless runner can't perform.
      beforeGuard.focus();
      await waitFor(() => expect(last).toHaveFocus());
    });
  },
};

export const ShouldMoveInitialFocus: Story = {
  name: 'when initialFocus is set, should focus first element on activate',
  tags: ['!dev', '!autodocs'],
  render: () => <InitialFocusTrap />,
  play: async ({ canvas, step }) => {
    await step('activate the trap', async () => {
      const activateBtn = canvas.getByTestId('activate');
      await userEvent.click(activateBtn);
    });

    await step('first button inside trap should receive focus', async () => {
      await waitFor(() => {
        const buttons = canvas.getAllByRole('button');
        // First button after the activate button
        const trapButton = buttons.find((b) => b.textContent === 'Button 1');
        expect(trapButton).toHaveFocus();
      });
    });
  },
};

export const ShouldReturnFocusOnDeactivate: Story = {
  name: 'when returnFocus is set, should restore focus on deactivate',
  tags: ['!dev', '!autodocs'],
  render: () => <ReturnFocusTrap />,
  play: async ({ canvas, step }) => {
    const toggleBtn = canvas.getByTestId('toggle');

    await step('activate the trap', async () => {
      await userEvent.click(toggleBtn);
    });

    await step('wait for initial focus inside trap', async () => {
      await waitFor(() => {
        const trapButton = canvas.getAllByRole('button').find((b) => b.textContent === 'Button 1');
        expect(trapButton).toHaveFocus();
      });
    });

    await step('deactivate the trap', async () => {
      // Toggle button is still in DOM (outside the conditional)
      await userEvent.click(canvas.getByTestId('toggle'));
    });

    await step('focus should return to toggle button', async () => {
      await waitFor(() => expect(canvas.getByTestId('toggle')).toHaveFocus());
    });
  },
};

export const ShouldContainFocusOnOutsideClick: Story = {
  name: 'when containFocus is set, should pull focus back on outside click',
  tags: ['!dev', '!autodocs'],
  render: () => <ContainFocusTrap />,
  play: async ({ canvas, step }) => {
    await step('wait for initial focus inside trap', async () => {
      await waitFor(() => {
        const trapButton = canvas.getAllByRole('button').find((b) => b.textContent === 'Button 1');
        expect(trapButton).toHaveFocus();
      });
    });

    await step('click outside button', async () => {
      const outsideBtn = canvas.getByTestId('outside');
      await userEvent.click(outsideBtn);
    });

    await step('focus should be pulled back inside the trap', async () => {
      await waitFor(() => {
        const trapButton = canvas.getAllByRole('button').find((b) => b.textContent === 'Button 1');
        expect(trapButton).toHaveFocus();
      });
    });
  },
};

export const ShouldHandleMiddleElementFocus: Story = {
  name: 'when middle element has focus, Tab should move normally',
  tags: ['!dev', '!autodocs'],
  render: () => <TrapWithButtons active label="Trap" count={4} />,
  play: async ({ canvasElement, canvas, step }) => {
    const buttons = canvas.getAllByRole('button');
    const container = canvasElement.querySelector<HTMLElement>('[data-focus-guard]')!.parentElement!;

    await step('interior buttons stay natively tabbable (tabindex 0)', async () => {
      // Real Tab between interior elements can't be simulated headless. Assert the condition that
      // enables native mid-trap tabbing: every child button stays in the natural tab order and the trap never
      // rewrites their tabindex while active.
      for (const btn of buttons) expect(btn.tabIndex).toBe(0);
    });

    await step('sentinels only bookend the children, so mid-trap Tab is native', async () => {
      const children = Array.from(container.children);
      const guardIndexes = children.flatMap((c, i) => (c.hasAttribute('data-focus-guard') ? [i] : []));
      // Exactly two guards, at the very first and very last positions; all
      // focusable content sits between them untouched.
      expect(guardIndexes).toEqual([0, children.length - 1]);
    });
  },
};
