/** Every provisioner factory `config/stores.config.ts` can register, re-exported side-effect-free. Import factories from here, never from `./index`: importing the index provisions the stores, which must only happen inside the Pulumi program. */
export { postgresManaged } from './postgres-managed';
