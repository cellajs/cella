import { appConfig, hierarchy } from 'shared';
import type { OtelSDKOptions } from 'shared/otel';

export const defaultHeaders = { 'Content-Type': 'application/json', 'x-forwarded-for': '123.123.123.123', Origin: appConfig.frontendUrl };

export const signUpUser = { email: 'test-user@example.com' };

/**
 * The organization's most and least privileged roles, read from the hierarchy: `admin` and `member` in the template,
 * so an app with other role names runs every test unchanged.
 */
export const adminRole = hierarchy.getMostPrivilegedRole('organization');
export const memberRole = hierarchy.getLeastPrivilegedRole('organization');

/** A config value as a test may set it: the literal types `satisfies` gives the defaults are widened. */
type Settable<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer U)[]
        ? readonly Settable<U>[]
        : T;

/**
 * Sets fields of a config object (`appConfig`, `appConfig.has`, `env`) and returns what puts the old values back. Each
 * test file loads its own modules, so an override for a whole file needs no restore; one test hands the result to
 * `onTestFinished`, one describe block sets it in `beforeAll` and restores it in `afterAll`.
 */
export function overrideConfig<T extends object>(target: T, overrides: { [K in keyof T]?: Settable<T[K]> }) {
  const before = new Map(Object.keys(overrides).map((key) => [key, Reflect.get(target, key)]));
  Object.assign(target, overrides);
  return () => {
    for (const [key, value] of before) {
      if (value === undefined) Reflect.deleteProperty(target, key);
      else Reflect.set(target, key, value);
    }
  };
}

export type ExportedSpan = Parameters<NonNullable<OtelSDKOptions['traceExporter']>['export']>[0][number];
export { collectingExporter } from 'shared/testing/telemetry';
