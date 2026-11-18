import { defineBackendModule } from '#/lib/module';
import { ltiLaunchHandlers, ltiPlatformHandlers, ltiResourceLinkHandlers } from '#/modules/lti-platform/lti-platform-handlers';

defineBackendModule({
  name: 'lti-platform',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `The app as an LTI 1.3 platform. An organization admin starts an LTI tool's Dynamic Registration; the
    LTI tool reads the platform's configuration and registers at the issuer, the authorization server. Its registration
    is private to the tenant, and its installation, a service account whose id is the LTI deployment id, waits for the
    admin's approval, which names the personal fields its launches may carry. A resource link places an installation in
    a channel; a launch of it signs the person's ID token at the issuer and posts it to the LTI tool in a frame.`,
  routes: [
    { path: '/tenants/:tenantId/organizations/:organizationId/lti-installations', app: ltiPlatformHandlers },
    { path: '/tenants/:tenantId/organizations/:organizationId/lti-resource-links', app: ltiResourceLinkHandlers },
    { path: '/lti-launches', app: ltiLaunchHandlers },
  ],
});
