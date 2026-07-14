import type { Preview } from '@storybook/react-vite';
import { LucideProvider } from 'lucide-react';
import { appConfig } from 'shared';
import '../src/styling/tailwind.css';

const preview: Preview = {
  decorators: [
    (Story) => (
      <LucideProvider strokeWidth={appConfig.theme.strokeWidth}>
        <Story />
      </LucideProvider>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },
  },
};

export default preview;
