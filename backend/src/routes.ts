import { appConfig } from 'shared';
import '#/modules'; // composition root: registers every backend module, whose route mounts are applied below
import { type BackendRoutePhase, getBackendRoutes } from '#/lib/module';
import { baseApp } from '#/server';
import { emailPreviewHandlers } from '../emails/preview-route';

// Mount per phase so param-segment mounts always come after every static path (see BackendRoutePhase).
const phases: BackendRoutePhase[] = ['static', 'absolute', 'tenant'];
for (const phase of phases) {
  for (const route of getBackendRoutes()) {
    if ((route.phase ?? 'static') === phase) baseApp.route(route.path, route.app);
  }
}

// Dev-only email preview (local authoring + Storybook email stories)
if (appConfig.mode !== 'production') baseApp.route('/dev/emails', emailPreviewHandlers);

export { baseApp };
