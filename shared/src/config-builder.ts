// Flat re-export of ./config-builder/: the package export map maps `./*` to `./src/*.ts`, so a
// directory barrel would not resolve as `shared/config-builder`.
export * from './config-builder/index.ts';
