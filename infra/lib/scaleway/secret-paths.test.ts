import { describe, expect, it } from 'vitest';
import { bootKeyCondition, ruleConditions, secretCopies, serviceKeyCondition } from './secret-paths';

const folders = (count: number, root = '/cella-staging-staging') =>
  Array.from({ length: count }, (_, index) => `resource.name.startsWith("${root}/shared/folder-${index}/")`);

describe('ruleConditions', () => {
  it('keeps a condition that fits one rule whole', () => {
    const condition = serviceKeyCondition('app', 'production', 'backend');
    expect(ruleConditions(condition)).toEqual([condition]);
    expect(ruleConditions(bootKeyCondition('app', 'production'))).toEqual([bootKeyCondition('app', 'production')]);
  });

  it('spreads a large condition over rules that each fit, every term once and in order', () => {
    const terms = folders(30);
    const rules = ruleConditions(terms.join(' || '));
    expect(rules.length).toBeGreaterThan(1);
    for (const rule of rules) expect(rule.length).toBeLessThanOrEqual(500);
    expect(rules.flatMap((rule) => rule.split(' || '))).toEqual(terms);
  });

  it('keeps a service condition with a long slug in one rule: it names one folder', () => {
    const condition = serviceKeyCondition('cella-staging', 'staging', 'backend');
    expect(ruleConditions(condition)).toEqual([condition]);
  });

  it('refuses a condition that needs more rules than one policy holds', () => {
    expect(() => ruleConditions(folders(90).join(' || '))).toThrow('one policy holds 9');
  });
});

describe('secretCopies', () => {
  it('keeps one copy of a secret in the folder of each consumer, and no shared folder', () => {
    expect(secretCopies({ services: ['backend', 'jobs'] }, 'app', 'production')).toEqual([
      { service: 'backend', path: '/app-production/backend/' },
      { service: 'jobs', path: '/app-production/jobs/' },
    ]);
  });

  it('grants a service its own folder and no other', () => {
    expect(serviceKeyCondition('app', 'production', 'jobs')).toBe('resource.name.startsWith("/app-production/jobs/")');
  });
});
