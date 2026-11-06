import { appConfig } from 'shared';
import '#/modules'; // composition root: registers every backend module, whose route mounts are applied below
import { checksAuthoringRules } from '#/core/openapi-validation';
import { assertMountPath } from '#/core/x-routes';
import { getBackendRoutes } from '#/lib/module';
import { baseApp } from '#/server';
import { emailPreviewHandlers } from '../emails/preview-route';

for (const route of getBackendRoutes()) {
  if (checksAuthoringRules)
    assertMountPath(
      route.path,
      route.app.routes.map(({ path }) => path),
    );
  baseApp.route(route.path, route.app);
}

// The email preview (local authoring, the Storybook email stories) is served in every mode but production; it renders fixtures only.
if (appConfig.mode !== 'production') baseApp.route('/dev/emails', emailPreviewHandlers);

export { baseApp };
