import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, CommandIcon, SpaceIcon } from 'lucide-react';
import { Kbd, KbdGroup } from '~/modules/ui/kbd';

/**
 * Keyboard key components for displaying keyboard shortcuts and hotkeys in documentation and UI.
 */
const meta: Meta = {
  title: 'ui/Kbd',
  component: Kbd,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;

type Story = StoryObj;

/**
 * Basic keyboard key display.
 */
export const Default: Story = {
  render: () => <Kbd>Ctrl</Kbd>,
};

/**
 * Single letter keys.
 */
export const Letters: Story = {
  render: () => (
    <div className="flex gap-2">
      <Kbd>A</Kbd>
      <Kbd>S</Kbd>
      <Kbd>D</Kbd>
      <Kbd>F</Kbd>
    </div>
  ),
};

/**
 * Number keys.
 */
export const Numbers: Story = {
  render: () => (
    <div className="flex gap-2">
      <Kbd>1</Kbd>
      <Kbd>2</Kbd>
      <Kbd>3</Kbd>
      <Kbd>4</Kbd>
      <Kbd>5</Kbd>
    </div>
  ),
};

/**
 * Special character keys.
 */
export const SpecialCharacters: Story = {
  render: () => (
    <div className="flex gap-2">
      <Kbd>+</Kbd>
      <Kbd>-</Kbd>
      <Kbd>=</Kbd>
      <Kbd>[</Kbd>
      <Kbd>]</Kbd>
    </div>
  ),
};

/**
 * Modifier keys with icons.
 */
export const ModifierKeys: Story = {
  render: () => (
    <div className="flex gap-2">
      <Kbd>⇧</Kbd>
      <Kbd>
        <CommandIcon className="size-3" />
      </Kbd>
      <Kbd>Alt</Kbd>
      <Kbd>Ctrl</Kbd>
    </div>
  ),
};

/**
 * Arrow keys.
 */
export const ArrowKeys: Story = {
  render: () => (
    <div className="flex gap-2">
      <Kbd>
        <ArrowUpIcon className="size-3" />
      </Kbd>
      <Kbd>
        <ArrowDownIcon className="size-3" />
      </Kbd>
      <Kbd>
        <ArrowLeftIcon className="size-3" />
      </Kbd>
      <Kbd>
        <ArrowRightIcon className="size-3" />
      </Kbd>
    </div>
  ),
};

/**
 * Action keys with icons.
 */
export const ActionKeys: Story = {
  render: () => (
    <div className="flex gap-2">
      <Kbd>↵</Kbd>
      <Kbd>Esc</Kbd>
      <Kbd>
        <ArrowRightIcon className="size-3" />
      </Kbd>
      <Kbd>
        <SpaceIcon className="size-3" />
      </Kbd>
    </div>
  ),
};

/**
 * Keyboard shortcut combinations.
 */
export const Shortcuts: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <KbdGroup>
          <Kbd>
            <CommandIcon className="size-3" />
          </Kbd>
          <Kbd>C</Kbd>
        </KbdGroup>
        <span className="text-sm">Copy</span>
      </div>

      <div className="flex items-center gap-2">
        <KbdGroup>
          <Kbd>
            <CommandIcon className="size-3" />
          </Kbd>
          <Kbd>V</Kbd>
        </KbdGroup>
        <span className="text-sm">Paste</span>
      </div>

      <div className="flex items-center gap-2">
        <KbdGroup>
          <Kbd>
            <CommandIcon className="size-3" />
          </Kbd>
          <Kbd>⇧</Kbd>
          <Kbd>Z</Kbd>
        </KbdGroup>
        <span className="text-sm">Redo</span>
      </div>
    </div>
  ),
};

/**
 * Complex keyboard shortcuts.
 */
export const ComplexShortcuts: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
          <Kbd>Alt</Kbd>
          <Kbd>Delete</Kbd>
        </KbdGroup>
        <span className="text-sm">Task Manager</span>
      </div>

      <div className="flex items-center gap-2">
        <KbdGroup>
          <Kbd>
            <CommandIcon className="size-3" />
          </Kbd>
          <Kbd>Option</Kbd>
          <Kbd>Esc</Kbd>
        </KbdGroup>
        <span className="text-sm">Force Quit</span>
      </div>

      <div className="flex items-center gap-2">
        <KbdGroup>
          <Kbd>⇧</Kbd>
          <Kbd>Tab</Kbd>
        </KbdGroup>
        <span className="text-sm">Reverse Tab</span>
      </div>
    </div>
  ),
};

/**
 * Function keys.
 */
export const FunctionKeys: Story = {
  render: () => (
    <div className="flex gap-2">
      <Kbd>F1</Kbd>
      <Kbd>F2</Kbd>
      <Kbd>F3</Kbd>
      <Kbd>F4</Kbd>
      <Kbd>F5</Kbd>
      <Kbd>F6</Kbd>
      <Kbd>F7</Kbd>
      <Kbd>F8</Kbd>
      <Kbd>F9</Kbd>
      <Kbd>F10</Kbd>
      <Kbd>F11</Kbd>
      <Kbd>F12</Kbd>
    </div>
  ),
};

/**
 * Navigation shortcuts.
 */
export const NavigationShortcuts: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-sm font-medium">Text Navigation</div>
        <div className="flex items-center gap-2">
          <KbdGroup>
            <Kbd>
              <CommandIcon className="size-3" />
            </Kbd>
            <Kbd>→</Kbd>
          </KbdGroup>
          <span className="text-sm">End of line</span>
        </div>
        <div className="flex items-center gap-2">
          <KbdGroup>
            <Kbd>
              <CommandIcon className="size-3" />
            </Kbd>
            <Kbd>←</Kbd>
          </KbdGroup>
          <span className="text-sm">Start of line</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Tab Navigation</div>
        <div className="flex items-center gap-2">
          <KbdGroup>
            <Kbd>Tab</Kbd>
          </KbdGroup>
          <span className="text-sm">Next field</span>
        </div>
        <div className="flex items-center gap-2">
          <KbdGroup>
            <Kbd>⇧</Kbd>
            <Kbd>Tab</Kbd>
          </KbdGroup>
          <span className="text-sm">Previous field</span>
        </div>
      </div>
    </div>
  ),
};

/**
 * Editor shortcuts.
 */
export const EditorShortcuts: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-sm font-medium">Text Editing</div>
        <div className="flex items-center gap-2">
          <KbdGroup>
            <Kbd>
              <CommandIcon className="size-3" />
            </Kbd>
            <Kbd>B</Kbd>
          </KbdGroup>
          <span className="text-sm">Bold</span>
        </div>
        <div className="flex items-center gap-2">
          <KbdGroup>
            <Kbd>
              <CommandIcon className="size-3" />
            </Kbd>
            <Kbd>I</Kbd>
          </KbdGroup>
          <span className="text-sm">Italic</span>
        </div>
        <div className="flex items-center gap-2">
          <KbdGroup>
            <Kbd>
              <CommandIcon className="size-3" />
            </Kbd>
            <Kbd>U</Kbd>
          </KbdGroup>
          <span className="text-sm">Underline</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Selection</div>
        <div className="flex items-center gap-2">
          <KbdGroup>
            <Kbd>
              <CommandIcon className="size-3" />
            </Kbd>
            <Kbd>A</Kbd>
          </KbdGroup>
          <span className="text-sm">Select All</span>
        </div>
        <div className="flex items-center gap-2">
          <KbdGroup>
            <Kbd>⇧</Kbd>
            <Kbd>→</Kbd>
          </KbdGroup>
          <span className="text-sm">Select character</span>
        </div>
      </div>
    </div>
  ),
};

/**
 * System shortcuts.
 */
export const SystemShortcuts: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-sm font-medium">Window Management</div>
        <div className="flex items-center gap-2">
          <KbdGroup>
            <Kbd>
              <CommandIcon className="size-3" />
            </Kbd>
            <Kbd>Q</Kbd>
          </KbdGroup>
          <span className="text-sm">Quit</span>
        </div>
        <div className="flex items-center gap-2">
          <KbdGroup>
            <Kbd>
              <CommandIcon className="size-3" />
            </Kbd>
            <Kbd>W</Kbd>
          </KbdGroup>
          <span className="text-sm">Close Window</span>
        </div>
        <div className="flex items-center gap-2">
          <KbdGroup>
            <Kbd>
              <CommandIcon className="size-3" />
            </Kbd>
            <Kbd>M</Kbd>
          </KbdGroup>
          <span className="text-sm">Minimize</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Screenshot</div>
        <div className="flex items-center gap-2">
          <KbdGroup>
            <Kbd>
              <CommandIcon className="size-3" />
            </Kbd>
            <Kbd>⇧</Kbd>
            <Kbd>4</Kbd>
          </KbdGroup>
          <span className="text-sm">Screenshot</span>
        </div>
      </div>
    </div>
  ),
};

/**
 * Custom styled keyboard keys.
 */
export const CustomStyled: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Kbd className="bg-red-100 text-red-800 border-red-300">Esc</Kbd>
        <Kbd className="bg-green-100 text-green-800 border-green-300">Enter</Kbd>
        <Kbd className="bg-blue-100 text-blue-800 border-blue-300">Space</Kbd>
      </div>

      <div className="flex items-center gap-2">
        <KbdGroup>
          <Kbd className="bg-purple-100 text-purple-800 border-purple-300">
            <CommandIcon className="size-3" />
          </Kbd>
          <Kbd className="bg-purple-100 text-purple-800 border-purple-300">K</Kbd>
        </KbdGroup>
        <span className="text-sm">Command Palette</span>
      </div>
    </div>
  ),
};

/**
 * Interactive keyboard shortcut guide.
 */
export const ShortcutGuide: Story = {
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Keyboard Shortcuts</h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">File Operations</div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <KbdGroup>
                    <Kbd>
                      <CommandIcon className="size-3" />
                    </Kbd>
                    <Kbd>N</Kbd>
                  </KbdGroup>
                  <span className="text-sm">New File</span>
                </div>
                <div className="flex items-center gap-2">
                  <KbdGroup>
                    <Kbd>
                      <CommandIcon className="size-3" />
                    </Kbd>
                    <Kbd>O</Kbd>
                  </KbdGroup>
                  <span className="text-sm">Open File</span>
                </div>
                <div className="flex items-center gap-2">
                  <KbdGroup>
                    <Kbd>
                      <CommandIcon className="size-3" />
                    </Kbd>
                    <Kbd>S</Kbd>
                  </KbdGroup>
                  <span className="text-sm">Save File</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">Edit Operations</div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <KbdGroup>
                    <Kbd>
                      <CommandIcon className="size-3" />
                    </Kbd>
                    <Kbd>Z</Kbd>
                  </KbdGroup>
                  <span className="text-sm">Undo</span>
                </div>
                <div className="flex items-center gap-2">
                  <KbdGroup>
                    <Kbd>
                      <CommandIcon className="size-3" />
                    </Kbd>
                    <Kbd>Y</Kbd>
                  </KbdGroup>
                  <span className="text-sm">Redo</span>
                </div>
                <div className="flex items-center gap-2">
                  <KbdGroup>
                    <Kbd>
                      <CommandIcon className="size-3" />
                    </Kbd>
                    <Kbd>F</Kbd>
                  </KbdGroup>
                  <span className="text-sm">Find</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium text-muted-foreground">Quick Actions</div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <KbdGroup>
                  <Kbd>
                    <CommandIcon className="size-3" />
                  </Kbd>
                  <Kbd>/</Kbd>
                </KbdGroup>
                <span className="text-sm">Search</span>
              </div>
              <div className="flex items-center gap-2">
                <KbdGroup>
                  <Kbd>
                    <CommandIcon className="size-3" />
                  </Kbd>
                  <Kbd>P</Kbd>
                </KbdGroup>
                <span className="text-sm">Command</span>
              </div>
              <div className="flex items-center gap-2">
                <KbdGroup>
                  <Kbd>?</Kbd>
                </KbdGroup>
                <span className="text-sm">Help</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
};
