import { serve } from '@hono/node-server';

import { env } from '../../env/env';
import { app } from './server';

serve(
  {
    fetch: app.fetch,
    hostname: '0.0.0.0',
    port: Number(env.PORT ?? '4000'),
  },
  (info) => {
    console.log(`Listening on http://${info.address}:${info.port}`);
  },
);
