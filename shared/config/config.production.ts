import type { DeepPartial } from '../src/config-builder/types';
import type { config as _default } from './config.default';

export const production = {
  mode: 'production',
  maintenance: false, // Set to true to enable maintenance mode
  googleMapsKey: 'AIzaSyBc1KkCJr6TNMeAw9XK4OunGVWDSXJAKEM',
} satisfies DeepPartial<typeof _default>;
