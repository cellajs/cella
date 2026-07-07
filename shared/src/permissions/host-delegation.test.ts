import { describe, expect, it } from 'vitest';
import { appConfig } from '../config-builder/app-config';
import { configurePermissions } from './access-policies';

/**
 * Host permission delegation (`delegateToHost`): a hosted row allows a delegated action
 * if the HOST row allows it — including the host's row conditions, public grants and
 * restrictions. Additive with the subject's own grants; fail-closed without a
 * caller-resolved hostRow.
 *
 * The runtime delegation path in `getAllDecisions` resolves the host type from the app
 * hierarchy (`hierarchy.getHostType`), so it can only be exercised in an app whose
 * hierarchy declares a `host:` relation (e.g. raak's attachment → task). The template
 * hierarchy has none, so this file covers the declaration-time validation; forks with a
 * host relation should extend it with runtime delegation tests.
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
