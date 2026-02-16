import type { DeepPartial } from './src/builder/types';
import type _default from './default-config';

export default {
  mode: 'production',
  maintenance: false, // Set to true to enable maintenance mode
  googleMapsKey: 'AIzaSyBc1KkCJr6TNMeAw9XK4OunGVWDSXJAKEM',
} satisfies DeepPartial<typeof _default>;
