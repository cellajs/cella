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
      // test mode: 'todo' shows violations in the test UI only | 'error' fails CI | 'off' skips checks
      test: 'todo',
    },
  },
};

export default preview;
