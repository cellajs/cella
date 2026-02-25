import type { DeepPartial } from './src/builder/types';
import type _default from './default-config';

export default {
  mode: 'production',
  maintenance: false, // Set to true to enable maintenance mode
  googleMapsKey: 'AIzaSyBc1KkCJr6TNMeAw9XK4OunGVWDSXJAKEM',
  // Scaleway deployment URLs (without custom domain)
  frontendUrl: 'https://dev-cella-frontend-v2.s3-website.nl-ams.scw.cloud',
  backendUrl: 'https://devcellacontainersyssaata6-dev-cella-backend.functions.fnc.nl-ams.scw.cloud',
  backendAuthUrl: 'https://devcellacontainersyssaata6-dev-cella-backend.functions.fnc.nl-ams.scw.cloud/auth',
} satisfies DeepPartial<typeof _default>;
