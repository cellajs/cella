import type { Config } from './default';

export default {
  mode: 'production',
  maintenance: false,
  googleMapsKey: 'AIzaSyBc1KkCJr6TNMeAw9XK4OunGVWDSXJAKEM',

  s3BucketPrefix: 'cella-production',
} satisfies Config;
