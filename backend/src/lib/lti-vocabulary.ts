/** The member of a platform's OpenID configuration that describes it as an LTI platform. */
export const ltiPlatformConfigurationMember = 'https://purl.imsglobal.org/spec/lti-platform-configuration';

/** The member of a registration request and its answer that describes the app as an LTI tool. */
export const ltiToolConfigurationMember = 'https://purl.imsglobal.org/spec/lti-tool-configuration';

/** The claims of an LTI message (LTI Core 1.3, section 5), by their full names. */
export const ltiClaims = {
  messageType: 'https://purl.imsglobal.org/spec/lti/claim/message_type',
  version: 'https://purl.imsglobal.org/spec/lti/claim/version',
  deploymentId: 'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
  targetLinkUri: 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri',
  resourceLink: 'https://purl.imsglobal.org/spec/lti/claim/resource_link',
  roles: 'https://purl.imsglobal.org/spec/lti/claim/roles',
  context: 'https://purl.imsglobal.org/spec/lti/claim/context',
  toolPlatform: 'https://purl.imsglobal.org/spec/lti/claim/tool_platform',
  launchPresentation: 'https://purl.imsglobal.org/spec/lti/claim/launch_presentation',
  custom: 'https://purl.imsglobal.org/spec/lti/claim/custom',
  /** Where the launch's course lists its members (Names and Role Provisioning Services 2.0, section 3.6.1.1). */
  namesRoleService: 'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice',
} as const;

/** Names and Role Provisioning Services 2.0 (NRPS): the service an LTI tool reads a course's members through. */
export const ltiNrps = {
  /** The scope a token request asks for to read a course's members (section 3.6.1.2). */
  scope: 'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
  /** The media type of a page of a course's members (section 2.1). */
  mediaType: 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json',
  /** The service version the claim names and the members' address answers. */
  version: '2.0',
} as const;

/** The LIS context types an LTI context may carry (LTI Core 1.3, appendix A.1). */
export const lisContextTypes = {
  courseTemplate: 'http://purl.imsglobal.org/vocab/lis/v2/course#CourseTemplate',
  courseOffering: 'http://purl.imsglobal.org/vocab/lis/v2/course#CourseOffering',
  courseSection: 'http://purl.imsglobal.org/vocab/lis/v2/course#CourseSection',
  group: 'http://purl.imsglobal.org/vocab/lis/v2/course#Group',
} as const;

/** The core LIS context roles (LTI Core 1.3, appendix A.2.3), as full URIs: short names are deprecated. */
export const lisContextRoles = {
  administrator: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Administrator',
  contentDeveloper: 'http://purl.imsglobal.org/vocab/lis/v2/membership#ContentDeveloper',
  instructor: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
  learner: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
  mentor: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Mentor',
} as const;

/**
 * A role as a full URI: a core context role by its short name (`Learner`, or `Instructor#TeachingAssistant` for a
 * sub-role), as NRPS lets a platform write it, is a LIS membership role. Any other role stays as it comes.
 */
export const lisRoleUri = (role: string) => {
  if (role.includes(':') || role.includes('/')) return role;
  const [base, subRole] = role.split('#');
  return subRole
    ? `http://purl.imsglobal.org/vocab/lis/v2/membership/${base}#${subRole}`
    : `http://purl.imsglobal.org/vocab/lis/v2/membership#${base}`;
};

/** The LTI system role a platform adds for a user it made for testing, such as a student view (LTI Core 1.3, A.2.4). */
export const ltiTestUserRole = 'http://purl.imsglobal.org/vocab/lti/system/person#TestUser';
