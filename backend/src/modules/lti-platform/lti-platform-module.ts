import { defineBackendModule } from '#/lib/module';
import {
  ltiLaunchHandlers,
  ltiMemberHandlers,
  ltiPlatformHandlers,
  ltiResourceLinkHandlers,
  ltiTabHandlers,
} from '#/modules/lti-platform/lti-platform-handlers';

defineBackendModule({
  name: 'lti-platform',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `The app as an LTI 1.3 platform. An organization admin starts an LTI tool's Dynamic Registration; the
    LTI tool reads the platform's configuration and registers at the issuer, the authorization server. Its registration
    is private to the tenant, and its installation, a service account whose id is the LTI deployment id, waits for the
    admin's approval, which names the personal fields its launches may carry and the access scopes its own tokens may
    carry. A resource link places an installation in a channel as a tab, which binds it there while it is on; a launch of it signs the person's ID
    token at the issuer and posts it to the LTI tool in a frame. With a token of its own, an installed LTI tool reads
    the members of a course it is placed in or below, by Names and Role Provisioning Services 2.0.`,
  routes: [
    { path: '/tenants/:tenantId/organizations/:organizationId/lti-installations', app: ltiPlatformHandlers },
    { path: '/tenants/:tenantId/organizations/:organizationId/lti-tabs', app: ltiTabHandlers },
    { path: '/tenants/:tenantId/organizations/:organizationId/lti-resource-links', app: ltiResourceLinkHandlers },
    { path: '/tenants/:tenantId/organizations/:organizationId/lti-members', app: ltiMemberHandlers },
    { path: '/lti-launches', app: ltiLaunchHandlers },
  ],
});
