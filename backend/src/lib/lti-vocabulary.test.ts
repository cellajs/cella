import { describe, expect, it } from 'vitest';
import { isLisContextRole, isLisRole, lisContextRoles, lisInstitutionRoles, lisRoleUri, lisSystemRoles } from '#/lib/lti-vocabulary';

const membership = 'http://purl.imsglobal.org/vocab/lis/v2/membership';

// Contract: a platform may still write a context role of LTI Core 1.3, appendix A.2.3, by its short name, as Sakai and
// NRPS's own figure do. Any other name is no LIS role, short or in full: the template's mapping admits nobody by it,
// and a platform's answer that sends it alone does not start.
describe('LIS roles', () => {
  it.each([
    ['Learner', lisContextRoles.learner],
    ['Instructor', lisContextRoles.instructor],
    ['Manager', lisContextRoles.manager],
    ['Officer', lisContextRoles.officer],
    ['Instructor#TeachingAssistant', `${membership}/Instructor#TeachingAssistant`],
    ['Officer#Vice-Chair', `${membership}/Officer#Vice-Chair`],
  ])('reads the context role %s as its full URI', (short, uri) => {
    expect(lisRoleUri(short)).toBe(uri);
    expect(isLisContextRole(uri)).toBe(true);
  });

  it.each([
    'Owner',
    'Owner#Admin',
    'learner',
    'Instructor#',
    'Instructor#A#B',
    'Administrator/Owner',
    'Student',
    `${membership}#Owner`,
    `${membership}/Owner#Admin`,
    `${membership}/Instructor#`,
    `${membership}Owner#Learner`,
    'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Owner',
    'http://purl.imsglobal.org/vocab/lis/v2/system/person#Owner',
    'urn:x-app:role',
  ])('keeps %s as it comes, no LIS role', (role) => {
    expect(lisRoleUri(role)).toBe(role);
    expect(isLisRole(role)).toBe(false);
  });

  it('keeps a LIS role in full as it comes', () => {
    for (const uri of [lisContextRoles.mentor, lisInstitutionRoles.administrator, lisSystemRoles.sysAdmin]) {
      expect(lisRoleUri(uri)).toBe(uri);
      expect(isLisRole(uri)).toBe(true);
    }
  });
});
