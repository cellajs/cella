import { ltiNrps } from '#/lib/lti-vocabulary';

/**
 * Learning platforms as their own code answers, for the LTI tool's tests: the OpenID configuration a registration
 * reads, the answer to the registration, and the member pages NRPS reads. Each follows its source, cited at its
 * builder, not this app's platform.
 */
export interface PlatformFixture {
  configurationUrl: string;
  configuration: Record<string, unknown> & { issuer: string; registration_endpoint: string; token_endpoint: string };
  registration: Record<string, unknown>;
  /** Where a course's members are, as a launch's NRPS claim names it. */
  membershipsUrl: (courseId: string) => string;
}

const nrpsHeaders = { 'Content-Type': ltiNrps.mediaType };

/**
 * A Canvas on its own host (canvas-lms `SecurityController#openid_configuration`): every endpoint on the account's
 * domain, `authorization_server` that domain as a bare host, members at `/api/lti/courses/:id/names_and_roles`.
 */
export const canvasPlatform = (host: string, clientId: string): PlatformFixture => ({
  configurationUrl: `https://${host}/api/lti/security/openid-configuration`,
  configuration: {
    issuer: `https://${host}`,
    authorization_endpoint: `https://${host}/api/lti/authorize_redirect`,
    registration_endpoint: `https://${host}/api/lti/registrations`,
    jwks_uri: `https://${host}/api/lti/security/jwks`,
    token_endpoint: `https://${host}/login/oauth2/token`,
    token_endpoint_auth_methods_supported: ['private_key_jwt'],
    token_endpoint_auth_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', ltiNrps.scope],
    response_types_supported: ['id_token'],
    id_token_signing_alg_values_supported: ['RS256'],
    claims_supported: ['sub', 'picture', 'email', 'name', 'given_name', 'family_name', 'locale'],
    subject_types_supported: ['public'],
    authorization_server: host,
    'https://purl.imsglobal.org/spec/lti-platform-configuration': {
      product_family_code: 'canvas',
      version: 'OpenSource',
      messages_supported: [{ type: 'LtiResourceLinkRequest' }],
    },
  },
  registration: { client_id: clientId, scope: ltiNrps.scope },
  membershipsUrl: (courseId) => `https://${host}/api/lti/courses/${courseId}/names_and_roles`,
});

/**
 * One page of Canvas's member list (canvas-lms docs, names_and_role): a member as its example shows it, and the `Link`
 * header its API pagination writes, which names the current, first and last page beside the next.
 */
export const canvasMemberPage = (url: URL, members: Record<string, unknown>[], next?: string) => {
  const page = (number: number) => `${url.origin}${url.pathname}?page=${number}&per_page=50`;
  const links = [`<${url.href}>; rel="current"`, ...(next ? [`<${next}>; rel="next"`] : []), `<${page(1)}>; rel="first"`, `<${page(2)}>; rel="last"`];
  const container = {
    id: url.href,
    context: { id: '4dde05e8ca1973bcca9bffc13e1548820eee93a3', label: 'CS-101', title: 'Computer Science 101' },
    members,
  };
  return Response.json(container, { headers: { ...nrpsHeaders, Link: links.join(',') } });
};

/** A member as Canvas's example lists one. */
export const canvasMember = (userId: string, name: string) => ({
  status: 'Active',
  name,
  picture: 'https://example.instructure.com/images/messages/avatar-50.png',
  given_name: name.split(' ')[0],
  family_name: name.split(' ')[1],
  email: `${name.split(' ')[0].toLowerCase()}@school.edu`,
  lis_person_sourcedid: '1238.8763.00',
  user_id: userId,
  roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor', 'http://purl.imsglobal.org/vocab/lis/v2/membership#ContentDeveloper'],
});

/**
 * A Moodle site (mod/lti/openid-configuration.php): the issuer is the site root, and an assertion names the token
 * endpoint, as the configuration names no `authorization_server`; members at the memberships service of a course and a tool binding
 * (ltiservice_memberships `contextmemberships`).
 */
export const moodlePlatform = (host: string, clientId: string): PlatformFixture => ({
  configurationUrl: `https://${host}/mod/lti/openid-configuration.php`,
  configuration: {
    issuer: `https://${host}`,
    token_endpoint: `https://${host}/mod/lti/token.php`,
    token_endpoint_auth_methods_supported: ['private_key_jwt'],
    token_endpoint_auth_signing_alg_values_supported: ['RS256'],
    jwks_uri: `https://${host}/mod/lti/certs.php`,
    authorization_endpoint: `https://${host}/mod/lti/auth.php`,
    registration_endpoint: `https://${host}/mod/lti/openid-registration.php`,
    scopes_supported: [ltiNrps.scope, 'openid'],
    response_types_supported: ['id_token'],
    subject_types_supported: ['public', 'pairwise'],
    id_token_signing_alg_values_supported: ['RS256'],
    claims_supported: ['sub', 'iss', 'name', 'given_name', 'family_name', 'email'],
    'https://purl.imsglobal.org/spec/lti-platform-configuration': {
      product_family_code: 'moodle',
      version: '4.5',
      messages_supported: [{ type: 'LtiResourceLinkRequest' }, { type: 'LtiDeepLinkingRequest', placements: ['ContentArea'] }],
    },
  },
  registration: { client_id: clientId, 'https://purl.imsglobal.org/spec/lti-tool-configuration': { deployment_id: '1' } },
  membershipsUrl: (courseId) => `https://${host}/mod/lti/services.php/CourseSection/${courseId}/bindings/1/memberships`,
});

/**
 * One page of Moodle's member list (ltiservice_memberships `users_to_json`): the container's id is the endpoint, the
 * next page's address `?limit=&from=` in a `Link` header, and a member's roles hold institution and system roles beside
 * its context roles. `relative` writes the next address as a reference to resolve against the page, as RFC 8288 lets it.
 */
export const moodleMemberPage = (url: URL, members: Record<string, unknown>[], next?: { from: number; relative?: boolean }) => {
  const nextUrl = next && `${next.relative ? '' : `${url.origin}${url.pathname}`}?limit=50&from=${next.from}`;
  const container = { id: `${url.origin}${url.pathname}`, context: { id: '2', label: 'BIO101', title: 'Introduction to biology' }, members };
  return Response.json(container, { headers: { ...nrpsHeaders, ...(nextUrl && { Link: `<${nextUrl}>; rel="next"` }) } });
};
