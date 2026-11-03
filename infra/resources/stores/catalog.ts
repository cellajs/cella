/**
 * Every provisioner factory `config/stores.config.ts` can register, re-exported side-effect-free. Import factories from here, never from
 * `./index`: importing the index provisions the stores, which must only happen inside the Pulumi program. The managed PostgreSQL is the one
 * kind; a store of another kind is a `StoreProvisioner` file beside it and its export line here.
 */
export { postgresManaged } from './postgres-managed';
