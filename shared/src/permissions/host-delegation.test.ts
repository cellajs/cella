import { describe, expect, it } from 'vitest';
import { appConfig } from '../config-builder/app-config';
import { configurePermissions } from './access-policies';

/**
 * Host permission delegation (`delegateToHost`) — declaration validation.
 *
 * Engine semantics (host verdict union incl. the host's own/public/restriction rules,
 * fail-closed without a resolved hostRow, per-action scoping) need a hierarchy with a
 * `host:` relationship; cella's config has none, so those are covered by the raak
 * fork's suites (host: task↔attachment) and, ahead, projectcampus (comment → item).
 */

describe('delegateToHost declaration', () => {
  it('throws for subjects without a hierarchy host', () => {
    expect(() =>
      configurePermissions(appConfig.entityTypes, ({ subject, delegateToHost }) => {
        if (subject.name === 'attachment') delegateToHost(['read']);
      }),
    ).toThrow('requires a host declared in the hierarchy');
  });

  it('throws on empty actions', () => {
    expect(() =>
      configurePermissions(appConfig.entityTypes, ({ subject, delegateToHost }) => {
        if (subject.name === 'attachment') delegateToHost([]);
      }),
    ).toThrow('at least one action');
  });
});
