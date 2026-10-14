import { describe, expect, it } from 'vitest';
import { bootKeyCondition, ruleConditions, serviceKeyCondition } from './secret-paths';

const folders = (count: number, root = '/cella-staging-staging') =>
  Array.from({ length: count }, (_, index) => `resource.name.startsWith("${root}/shared/folder-${index}/")`);

describe('ruleConditions', () => {
  it('keeps a condition that fits one rule whole', () => {
    const condition = serviceKeyCondition('app', 'production', 'backend', [['backend', 'cdc']]);
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

  it('spreads the condition of a single-machine host with a long slug, which Scaleway refuses in one rule', () => {
    const services = ['backend', 'cdc', 'yjs', 'mcp', 'oauth', 'jobs', 'frontend'];
    const consumerSets = [
      ['backend', 'cdc'],
      ['backend', 'jobs', 'mcp'],
      ['backend', 'mcp'],
      ['backend', 'yjs'],
    ];
    const condition = serviceKeyCondition('cella-staging', 'staging', services, consumerSets);
    expect(condition.length).toBeGreaterThan(700);
    const rules = ruleConditions(condition);
    expect(rules).toHaveLength(2);
    expect(rules.join(' || ')).toBe(condition);
  });

  it('refuses a condition that needs more rules than one policy holds', () => {
    expect(() => ruleConditions(folders(90).join(' || '))).toThrow('one policy holds 9');
  });
});
