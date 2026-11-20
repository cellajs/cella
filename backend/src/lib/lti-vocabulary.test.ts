import { describe, expect, it } from 'vitest';
import { isLisContextRole, lisContextRoles, lisRoleUri } from '#/lib/lti-vocabulary';

// Contract: a platform may still write a context role of LTI Core 1.3, appendix A.2.3, by its short name, as Sakai and
// NRPS's own figure do. Any other short name is no LIS role: the template's mapping admits nobody by it.
describe('lisRoleUri', () => {
  it.each([
    ['Learner', lisContextRoles.learner],
    ['Instructor', lisContextRoles.instructor],
    ['Manager', lisContextRoles.manager],
    ['Officer', lisContextRoles.officer],
    ['Instructor#TeachingAssistant', 'http://purl.imsglobal.org/vocab/lis/v2/membership/Instructor#TeachingAssistant'],
    ['Officer#Vice-Chair', 'http://purl.imsglobal.org/vocab/lis/v2/membership/Officer#Vice-Chair'],
  ])('reads the context role %s as its full URI', (short, uri) => {
    expect(lisRoleUri(short)).toBe(uri);
    expect(isLisContextRole(lisRoleUri(short))).toBe(true);
  });

  it.each(['Owner', 'Owner#Admin', 'learner', 'Instructor#', 'Instructor#A#B', 'Administrator/Owner', 'Student'])(
    'keeps %s as it comes, no LIS role',
    (role) => {
      expect(lisRoleUri(role)).toBe(role);
      expect(isLisContextRole(lisRoleUri(role))).toBe(false);
    },
  );

  it('keeps a full URI as it comes', () => {
    for (const uri of [lisContextRoles.mentor, 'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator', 'urn:x-app:role'])
      expect(lisRoleUri(uri)).toBe(uri);
  });
});
