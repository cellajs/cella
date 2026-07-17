/**
 * Test-only policy helper.
 *
 * `configureAccessPolicies` drives the engine with synthetic, deliberately-partial policy sets
 * (completeness validation OFF). It is NOT the app configuration API. That is `configurePermissions`
 * (which returns public read grants and validates completeness). Keeping this off the public `shared`
 * barrel is deliberate: exposing it there is exactly how it once got mistaken for the config entry
 * point. Import it from `shared/testing/policies`, in tests only.
 */
export { configureAccessPolicies } from '../permissions/access-policies';
