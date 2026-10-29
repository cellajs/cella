import { describe, expect, it } from 'vitest';
import { ruleConditions, secretCopies, serviceKeyCondition } from './secret-paths';

const folders = (count: number) => Array.from({ length: count }, (_, index) => `resource.name.startsWith("/shared/folder-${index}/")`);

describe('ruleConditions', () => {
  it('keeps a condition that fits one rule whole', () => {
    const condition = serviceKeyCondition('backend');
    expect(ruleConditions(condition)).toEqual([condition]);
  });

  it('spreads a large condition over rules that each fit, every term once and in order', () => {
    const terms = folders(40);
    const rules = ruleConditions(terms.join(' || '));
    expect(rules.length).toBeGreaterThan(1);
    for (const rule of rules) expect(rule.length).toBeLessThanOrEqual(500);
    expect(rules.flatMap((rule) => rule.split(' || '))).toEqual(terms);
  });

  it('refuses a condition that needs more rules than one policy holds', () => {
    expect(() => ruleConditions(folders(120).join(' || '))).toThrow('one policy holds 9');
  });
});

describe('secretCopies', () => {
  it('keeps one copy of a secret in the folder of each consumer, and no shared folder', () => {
    expect(secretCopies({ services: ['backend', 'jobs'] })).toEqual([
      { service: 'backend', path: '/backend/' },
      { service: 'jobs', path: '/jobs/' },
    ]);
  });

  it('grants a service its own folder and no other', () => {
    expect(serviceKeyCondition('jobs')).toBe('resource.name.startsWith("/jobs/")');
  });
});
