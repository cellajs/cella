# Changelog

## [0.3.5](https://github.com/cellajs/cella/compare/0.3.4...0.3.5) (2026-07-14)


### 🎉 New features

* **cdc:** identify the slot holder in slot-contention retry warnings ([#878](https://github.com/cellajs/cella/issues/878)) ([1690c77](https://github.com/cellajs/cella/commit/1690c77f3d4389304b5eb585efe3fbbbe5f2f5f6))
* entity grid enrichment — member previews, activity stamps, grid polish ([#877](https://github.com/cellajs/cella/issues/877)) ([9b36fe0](https://github.com/cellajs/cella/commit/9b36fe01db9e04acab6986944f636ddbb1a670e0))
* **infra:** projectcampus go-live upstreams - singleVM hardening, cert gates, state-bucket guardrails ([#879](https://github.com/cellajs/cella/issues/879)) ([518f6fe](https://github.com/cellajs/cella/commit/518f6fe2983028b5d7c7c6318d1f3528d294b439))
* permission feature additions for projectcampus ([#873](https://github.com/cellajs/cella/issues/873)) ([2bd01e7](https://github.com/cellajs/cella/commit/2bd01e7899945f9563539853712f7f0a41f26bfb))


### 🐞 Bug fixes

* mock iso date determinism ([6f5cde0](https://github.com/cellajs/cella/commit/6f5cde01a48f3e287351b7a29a2ce633591040fb))


### ⏪ Reverts

* ignore maintenances change (no-op ignoreChanges) ([#874](https://github.com/cellajs/cella/issues/874)) ([259d80c](https://github.com/cellajs/cella/commit/259d80cb6e761349a619e9dbce9a0a24375cc446))

## [0.3.4](https://github.com/cellajs/cella/compare/0.3.3...0.3.4) (2026-07-09)


### 🐞 Bug fixes

* ignore maintenances change ([2620872](https://github.com/cellajs/cella/commit/2620872acbd70364403c7cfef1ae1e116e517a43))

## [0.3.3](https://github.com/cellajs/cella/compare/0.3.2...0.3.3) (2026-07-09)


### 🐞 Bug fixes

* fix lockfile ([#870](https://github.com/cellajs/cella/issues/870)) ([36664c4](https://github.com/cellajs/cella/commit/36664c4ba35ebd5bb801ecc34278000adaae77f7))

## [0.3.2](https://github.com/cellajs/cella/compare/0.3.1...0.3.2) (2026-07-09)


### 🎉 New features

* docs search and ui improvements ([#867](https://github.com/cellajs/cella/issues/867)) ([f2e077a](https://github.com/cellajs/cella/commit/f2e077a37a68ad667758699c7134a95340d57b5a))

## [0.3.1](https://github.com/cellajs/cella/compare/0.3.0...0.3.1) (2026-07-08)


### 🎉 New features

* deploy improvements and fix for otel core override deploy ([#864](https://github.com/cellajs/cella/issues/864)) ([0370090](https://github.com/cellajs/cella/commit/0370090a81d3376b0393a3d2e76b2843135e99bf))

## [0.3.0](https://github.com/cellajs/cella/compare/0.2.2...0.3.0) (2026-07-08)


### ⚠ BREAKING CHANGES

* Worktree mdx pages instead of db model for pages ([#855](https://github.com/cellajs/cella/issues/855))

### 🎉 New features

* autolink repo file paths in docs inline code to GitHub ([#858](https://github.com/cellajs/cella/issues/858)) ([3a3b382](https://github.com/cellajs/cella/commit/3a3b3822309c0e1eace2aaed6ba863be322b59b2))
* deepest-non-null-ancestor context attribution + template-adapted tests ([7f6d940](https://github.com/cellajs/cella/commit/7f6d9402e2ffef0139871c47466c04f1046b8fde))
* fork alignment ([ded27fb](https://github.com/cellajs/cella/commit/ded27fb10e183ab4696e5d9723b47b589d0f97f6))
* many improvements ([#862](https://github.com/cellajs/cella/issues/862)) ([6b1ca8f](https://github.com/cellajs/cella/commit/6b1ca8f33d7f6ab41e38ac022ec3bef7cc6ccd34))
* mdx consolidation ([#857](https://github.com/cellajs/cella/issues/857)) ([5e69279](https://github.com/cellajs/cella/commit/5e69279581d9e728e45ba57cd64eaf7df45fff2f))
* **permissions:** topology seam + wide-fixture kit for fork-independent engine tests ([#861](https://github.com/cellajs/cella/issues/861)) ([d4c3de6](https://github.com/cellajs/cella/commit/d4c3de6e857479ec67915f92b61167cada1e36aa))
* Worktree mdx pages instead of db model for pages ([#855](https://github.com/cellajs/cella/issues/855)) ([d7af703](https://github.com/cellajs/cella/commit/d7af70330ec915ee3725ed9530e5e0e9476e995a))


### 🐞 Bug fixes

* docs imporvements ([049df07](https://github.com/cellajs/cella/commit/049df0719a5e7e07649f7a698494ffc8a9c1bf7d))
* omitted generated changes from page model removal ([91a4c10](https://github.com/cellajs/cella/commit/91a4c10fe392e261d2a398629c6b4ead9f0f590a))


### 🔧 Small improvements

* **cdc:** cleanup + typed wire contract + app-stream kind discriminant ([#859](https://github.com/cellajs/cella/issues/859)) ([4b2bf27](https://github.com/cellajs/cella/commit/4b2bf2716c421bd488d4780d3d3fe8c3b62f4ff9))
* consolidate service Dockerfiles into one multi-target file ([#851](https://github.com/cellajs/cella/issues/851)) ([0e055b4](https://github.com/cellajs/cella/commit/0e055b4b3bbb808139631f18b99b635e9cab4244))


### 📖 Documentation

* document the lens schema-evolution system ([c44cde2](https://github.com/cellajs/cella/commit/c44cde28e62b37d3115232ff9b29308b617f87d9))

## [0.2.2](https://github.com/cellajs/cella/compare/0.2.1...0.2.2) (2026-07-05)


### 🎉 New features

* encrypt TOTP secrets at rest ([#847](https://github.com/cellajs/cella/issues/847)) ([9f16d90](https://github.com/cellajs/cella/commit/9f16d90f929bd31e61a63a9d106e91ccb3c2944d))
* log refactor ([#848](https://github.com/cellajs/cella/issues/848)) ([ae1bfa3](https://github.com/cellajs/cella/commit/ae1bfa30b83868fa33bea34b7d7548733faa48f7))


### 🐞 Bug fixes

* type in yjs Dockerfile ([#843](https://github.com/cellajs/cella/issues/843)) ([f637c3e](https://github.com/cellajs/cella/commit/f637c3e1412b2e7077896951dc1f9adf3e53dbd6))


### 🔧 Small improvements

* infra audit ([#846](https://github.com/cellajs/cella/issues/846)) ([e8b85a0](https://github.com/cellajs/cella/commit/e8b85a0de59b8b42f631380366a9bb1ae45098bf))

## [0.2.1](https://github.com/cellajs/cella/compare/0.2.0...0.2.1) (2026-07-04)


### 🐞 Bug fixes

* otel versioning mismatch ([#841](https://github.com/cellajs/cella/issues/841)) ([79ca53f](https://github.com/cellajs/cella/commit/79ca53f98875e55fa3c4cd95d95b4d868022efd1))

## [0.2.0](https://github.com/cellajs/cella/compare/0.1.1...0.2.0) (2026-07-04)


### ⚠ BREAKING CHANGES

* cella cli moved to an npm package ([#840](https://github.com/cellajs/cella/issues/840))

### 🎉 New features

* cella cli more informative during analyze ([#839](https://github.com/cellajs/cella/issues/839)) ([f8d4cd3](https://github.com/cellajs/cella/commit/f8d4cd34b78773416d4d270b6e42f5fc4d50d842))
* cella cli moved to an npm package ([#840](https://github.com/cellajs/cella/issues/840)) ([8614d6a](https://github.com/cellajs/cella/commit/8614d6a42a40e89ec86778d2c208c5280686491e))
* cella cli sync rerun ([#836](https://github.com/cellajs/cella/issues/836)) ([b3bb81d](https://github.com/cellajs/cella/commit/b3bb81dc31aef45a732ede7f13e2a9eb22f82b1c))
* cli should make sure main is up to date before syncing ([16e45c1](https://github.com/cellajs/cella/commit/16e45c1365faf597f4904d065783719bc325ee5a))
* **cli:** add release workflow ([#835](https://github.com/cellajs/cella/issues/835)) ([7ab5dff](https://github.com/cellajs/cella/commit/7ab5dff67ad0bb8f7bb3a368a43361e1996b0dc0))
* dont show analyze/sync in cella itself ([380bd41](https://github.com/cellajs/cella/commit/380bd419b1e9148c78ddd2c7599fdf5c521dd39d))
* idempotent cella cli sync ([0d774ea](https://github.com/cellajs/cella/commit/0d774ea3797a6e14ab5adf8ee7ac5964d314e3e0))
* **infra:** wire appConfig.singleVM into the deploy layer ([#833](https://github.com/cellajs/cella/issues/833)) ([267c698](https://github.com/cellajs/cella/commit/267c698e42e698bf988e63276a6cb97057c53703))
* restage on resume cella sync ([#838](https://github.com/cellajs/cella/issues/838)) ([80e2a86](https://github.com/cellajs/cella/commit/80e2a86880dc395c192b365f376abd88aca718e5))
* simplify db maintenance logic ([c5a1970](https://github.com/cellajs/cella/commit/c5a1970dca2d94dcd75b274ac8f6b9fc26f0c6b0))


### 🐞 Bug fixes

* cella sync should trust manifest.json ([204dd2a](https://github.com/cellajs/cella/commit/204dd2aaee196aec030cbd0a3d09b7f99505b48e))
* properly clean up test-db-config ([#834](https://github.com/cellajs/cella/issues/834)) ([5d3edbc](https://github.com/cellajs/cella/commit/5d3edbc00843471ef39f2403ad8faaf63eec5c18))

## [0.1.1](https://github.com/cellajs/cella/compare/0.1.0...0.1.1) (2026-07-01)


### 🐞 Bug fixes

* ci and create-cella fixes ([#830](https://github.com/cellajs/cella/issues/830)) ([5cd1dbd](https://github.com/cellajs/cella/commit/5cd1dbd4859972e0cec0cb68fc501f05a8e8d280))
* **ci:** resolve scaffold dir via $RUNNER_TEMP in template-drift ([#829](https://github.com/cellajs/cella/issues/829)) ([5e1ec97](https://github.com/cellajs/cella/commit/5e1ec9793677a425b838ae87035680c126c5cf7a))

## [0.1.0](https://github.com/cellajs/cella/compare/0.0.2...0.1.0) (2026-07-01)


### ⚠ BREAKING CHANGES

* **create-cella:** drop auto-install and shell access ([#821](https://github.com/cellajs/cella/issues/821))

### 🎉 New features

* **create-cella:** drop auto-install and shell access ([#821](https://github.com/cellajs/cella/issues/821)) ([3b3bdb6](https://github.com/cellajs/cella/commit/3b3bdb61a57a8d6a7a4dfd08aa1b314630eec1e4))


### 🐞 Bug fixes

* allow production deploy from release tag ref ([#812](https://github.com/cellajs/cella/issues/812)) ([169883b](https://github.com/cellajs/cella/commit/169883b1742ac3dde6f84ff7532a6bf5a78841cd))
* pin protobufjs to patched 8.x to clear high-severity audit advisories ([#814](https://github.com/cellajs/cella/issues/814)) ([f3aa942](https://github.com/cellajs/cella/commit/f3aa9424116f80ffdb955b7b650c2992b718d79f))


### 🔧 Small improvements

* cli sync config simplification ([#825](https://github.com/cellajs/cella/issues/825)) ([73be0e0](https://github.com/cellajs/cella/commit/73be0e0e62a2a239b74a23eaef36117e32f1a3ba))
* **create-cella:** replace git binary with isomorphic-git ([#820](https://github.com/cellajs/cella/issues/820)) ([12ce6dc](https://github.com/cellajs/cella/commit/12ce6dc0b4ba2a46b3bbfd5ac53731b24a016b1e))


### 📖 Documentation

* align create-cella docs with no-shell scaffolding ([#822](https://github.com/cellajs/cella/issues/822)) ([f1117be](https://github.com/cellajs/cella/commit/f1117bead5b9ecd0af5516c72225900cc8cd72e5))

## [0.0.2](https://github.com/cellajs/cella/compare/0.0.1...0.0.2) (2026-06-30)


### 🎉 New features

* prepare cella for release ([41ba9dc](https://github.com/cellajs/cella/commit/41ba9dc7da9c90d8b3aeea9966873e4f486e113a))
* prune deployments in gh action finale ([#810](https://github.com/cellajs/cella/issues/810)) ([721143b](https://github.com/cellajs/cella/commit/721143bde659569786b57ba0d113956b4b56b0d5))
* unified idb instance per user for local app cache ([671edbf](https://github.com/cellajs/cella/commit/671edbf1a875beb3b282d03b9fdf028f3439efc5))


### 🐞 Bug fixes

* **create-cella:** singleVM missing from default config placeholder ([6f5e680](https://github.com/cellajs/cella/commit/6f5e6809d3c8ab34c6ff0b52c020854e5a4fe3e5))
* deploy failed due to symlinks, improve diagnosis ([447c5b2](https://github.com/cellajs/cella/commit/447c5b2f8a1603ae8c00b9bd6f97d2bc61966f15))
* dockerfile needs to include cdc and yjs to pass when singleVM is true, removed no-op dockerignore ([fec9ab4](https://github.com/cellajs/cella/commit/fec9ab406d440ff7fa66b66ed99ece1d06ab7557))
* get rid of pnpm catalog mess ([bc69a3c](https://github.com/cellajs/cella/commit/bc69a3c6ed7c726e12b76fda32cd712514ebba7c))
