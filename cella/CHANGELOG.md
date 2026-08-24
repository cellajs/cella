# Changelog

## [0.9.8](https://github.com/cellajs/cella/compare/0.9.7...0.9.8) (2026-08-24)


### 🎉 New features

* joined button hover-swap X with dropdowner leave popconfirm ([#1097](https://github.com/cellajs/cella/issues/1097)) ([6fafcf1](https://github.com/cellajs/cella/commit/6fafcf1d41b330a8579324c62b7d012ab9edf619))
* retire common fork drift via registry seam, counts seam and docs glob ([#1100](https://github.com/cellajs/cella/issues/1100)) ([e5fd19b](https://github.com/cellajs/cella/commit/e5fd19b3c2ea4381f462953f16dd9a89536ba0af))


### 🐞 Bug fixes

* **ci:** exempt release changelog from app-vocabulary gate ([#1101](https://github.com/cellajs/cella/issues/1101)) ([0a06c49](https://github.com/cellajs/cella/commit/0a06c4973836f2d55328100f23866c68392ad637))
* **test:** pick a materializer-free product type in yjs-materializers test ([#1099](https://github.com/cellajs/cella/issues/1099)) ([9af8689](https://github.com/cellajs/cella/commit/9af8689e982ee2dbd9bd22f71131757b28a2b06f))

## [0.9.7](https://github.com/cellajs/cella/compare/0.9.6...0.9.7) (2026-08-24)


### 🎉 New features

* projectcampus upstream intake round 2 ([#1095](https://github.com/cellajs/cella/issues/1095)) ([035f3a2](https://github.com/cellajs/cella/commit/035f3a2871a5f1269eb7f9a0818b04ac69b8e2bb))


### 🐞 Bug fixes

* stop infinite paging on drifted totals + settle CDC slot before counter recalc ([#1096](https://github.com/cellajs/cella/issues/1096)) ([263b0cd](https://github.com/cellajs/cella/commit/263b0cdae42f8bc51e234e2069e780dc60f4861d))


### 🔧 Small improvements

* **infra:** async exec so the registry wait really overlaps the frontend build ([#1093](https://github.com/cellajs/cella/issues/1093)) ([a000598](https://github.com/cellajs/cella/commit/a000598a770050f5895fdb3ae5ef4092d2ed6336))

## [0.9.6](https://github.com/cellajs/cella/compare/0.9.5...0.9.6) (2026-08-20)


### 🔧 Small improvements

* **infra:** Tier 1 deploy critical-path trims + honest singleVM cutover ([#1091](https://github.com/cellajs/cella/issues/1091)) ([8240177](https://github.com/cellajs/cella/commit/8240177c448144ec42a4ce3cf045c37aa676a28a))

## [0.9.5](https://github.com/cellajs/cella/compare/0.9.4...0.9.5) (2026-08-19)


### 🐞 Bug fixes

* **infra:** defer Caddy's Cache-Control so it replaces the origin's ([#1088](https://github.com/cellajs/cella/issues/1088)) ([7718aea](https://github.com/cellajs/cella/commit/7718aea70fb7a2a1afa34223aeabc13efa6583a5))


### 🔧 Small improvements

* **frontend:** keep the editor out of startup, defer the upload service ([#1089](https://github.com/cellajs/cella/issues/1089)) ([f3a68b6](https://github.com/cellajs/cella/commit/f3a68b635280198a9239a59d5249c401ad1d1531))

## [0.9.4](https://github.com/cellajs/cella/compare/0.9.3...0.9.4) (2026-08-19)


### 🐞 Bug fixes

* **frontend:** floating-nav touch taps via touchend + shorter reset cooldown ([#1086](https://github.com/cellajs/cella/issues/1086)) ([3edf532](https://github.com/cellajs/cella/commit/3edf5323f19ad298731d66757ffbcb35a5b9a586))


### 🔧 Small improvements

* bundle the server runtimes, load 15 packages instead of 500 ([#1084](https://github.com/cellajs/cella/issues/1084)) ([3431973](https://github.com/cellajs/cella/commit/343197314f0a72712f6ba1cd079b5376a907dcc5))
* install only what the services load, cutting the backend image by a third ([#1087](https://github.com/cellajs/cella/issues/1087)) ([a2d3c77](https://github.com/cellajs/cella/commit/a2d3c77443f0e0a2b0a8aa3187d391d4447d133a))
* name the OTel instrumentations instead of installing all 41 ([#1083](https://github.com/cellajs/cella/issues/1083)) ([e2d4fa9](https://github.com/cellajs/cella/commit/e2d4fa90150ed52b904931dfa7a54700aa93cdd7))

## [0.9.3](https://github.com/cellajs/cella/compare/0.9.2...0.9.3) (2026-08-19)


### 🎉 New features

* dependency and bundle-size tooling, halve the frontend boot path ([#1082](https://github.com/cellajs/cella/issues/1082)) ([fc6d2ca](https://github.com/cellajs/cella/commit/fc6d2ca7d46c9ed1e59ce43dd51006b4e4dd2405))
* **frontend:** animate row reorder in data grid via row-box mode ([#1066](https://github.com/cellajs/cella/issues/1066)) ([8c8cb51](https://github.com/cellajs/cella/commit/8c8cb512e1c6c361235b555b7bc97a05937660f4))
* **frontend:** inactive badge on last-seen, profile content owns its container ([#1074](https://github.com/cellajs/cella/issues/1074)) ([31aa328](https://github.com/cellajs/cella/commit/31aa3284b37a092f38f0dd9bee0998feedc41fb0))
* **frontend:** show root package version on docs landing page ([#1061](https://github.com/cellajs/cella/issues/1061)) ([bebfea9](https://github.com/cellajs/cella/commit/bebfea99cdcedbbf41dde0291f685876d8a1eade))
* **frontend:** show single healthy summary in info panel status section ([#1065](https://github.com/cellajs/cella/issues/1065)) ([0c32eb9](https://github.com/cellajs/cella/commit/0c32eb9083b54b8e5bc764a042a24bf19bf5fa28))
* **frontend:** tab descriptions in the tabs arrangement card ([#1081](https://github.com/cellajs/cella/issues/1081)) ([4a2071e](https://github.com/cellajs/cella/commit/4a2071e4bf9622c3d4c51990d7f3aa35188a4173))
* projectcampus upstream intake (proposals 1-15) ([#1069](https://github.com/cellajs/cella/issues/1069)) ([5194484](https://github.com/cellajs/cella/commit/51944844d7be28f916c2370f1ad5d811f6b9676c))
* single devPorts knob for local dev service ports ([#1067](https://github.com/cellajs/cella/issues/1067)) ([4853e28](https://github.com/cellajs/cella/commit/4853e28fc2ab48ce8f2d9295433a66671857b5fa))


### 🐞 Bug fixes

* **backend:** accept any membership in the org in orgGuard ([#1073](https://github.com/cellajs/cella/issues/1073)) ([2c27a3f](https://github.com/cellajs/cella/commit/2c27a3f038884f08f40711883cb463579e0d4201))
* fall back to port 3000 when deriving storybook port ([#1075](https://github.com/cellajs/cella/issues/1075)) ([0e96d34](https://github.com/cellajs/cella/commit/0e96d3422118be1a8c02607d1de0aefd6924e13f))
* **frontend:** collapse docs sidebar branches only from the route they point at ([#1070](https://github.com/cellajs/cella/issues/1070)) ([73e2a9f](https://github.com/cellajs/cella/commit/73e2a9f68c61efacf31dea5dcb701dd282927877))
* **frontend:** grids no longer set their own page padding ([#1080](https://github.com/cellajs/cella/issues/1080)) ([3d4475a](https://github.com/cellajs/cella/commit/3d4475a1446e9080c0533d800a4eabd1823253ed))
* **frontend:** keep role visible in menu sheet item, append submenu count only in compact menu ([#1064](https://github.com/cellajs/cella/issues/1064)) ([663b048](https://github.com/cellajs/cella/commit/663b0487cefcccc14b3bf69f4bc759dbc2fb2d66))
* **frontend:** probe session cookie before bouncing signed-in users to authenticate ([#1063](https://github.com/cellajs/cella/issues/1063)) ([8619309](https://github.com/cellajs/cella/commit/861930925ad35e519915bc3819553f4d473bf987))
* **frontend:** scope role selectors to the channel's role vocabulary ([#1071](https://github.com/cellajs/cella/issues/1071)) ([18216c7](https://github.com/cellajs/cella/commit/18216c7ffee4612d8f4898da2e09e9bdba12146e))
* **infra:** retire release SHA from shell + close CI/CD injection-class gaps ([#1078](https://github.com/cellajs/cella/issues/1078)) ([388e408](https://github.com/cellajs/cella/commit/388e408e6575c197dd086ec89ad329191048ef75))


### 🧹 Chores

* adopt projectcampus comment budget ([#1076](https://github.com/cellajs/cella/issues/1076)) ([aeb42a3](https://github.com/cellajs/cella/commit/aeb42a3d61328b2db85869071cc7c254932c1447))
* **infra:** prune unreferenced package scripts, gate compose drift in CI ([#1077](https://github.com/cellajs/cella/issues/1077)) ([85181d0](https://github.com/cellajs/cella/commit/85181d0e983c19b4a0f54899de6642c191ec3082))

## [0.9.2](https://github.com/cellajs/cella/compare/0.9.1...0.9.2) (2026-08-15)


### 🐞 Bug fixes

* **frontend:** tab drag preview label + lone entity grid tile width ([#1059](https://github.com/cellajs/cella/issues/1059)) ([98df2d2](https://github.com/cellajs/cella/commit/98df2d28524b61378fe0d432a0784a7ea0f61946))


### 🔧 Small improvements

* **infra:** take reap and per-key HEAD probes off the deploy critical path ([#1060](https://github.com/cellajs/cella/issues/1060)) ([8e13d4f](https://github.com/cellajs/cella/commit/8e13d4f22f65d668ee8f5d0f221773c8764946f1))


### 🧹 Chores

* **deps:** minor/patch dependency sweep, migrate blocknote 0.54 highlighter ([#1056](https://github.com/cellajs/cella/issues/1056)) ([23d23da](https://github.com/cellajs/cella/commit/23d23dada548db41c5092b82eaa8f21b93b96a74))

## [0.9.1](https://github.com/cellajs/cella/compare/0.9.0...0.9.1) (2026-08-14)


### 🎉 New features

* **auth:** carry post-auth deep-link redirect through magic link, OAuth and MFA ([#1054](https://github.com/cellajs/cella/issues/1054)) ([e297a3c](https://github.com/cellajs/cella/commit/e297a3c5dc5afc46eeab504f41d7e169c4c095fa))


### 🐞 Bug fixes

* **auth:** create OAuth client auth lazily so empty secrets don't crash module load ([#1053](https://github.com/cellajs/cella/issues/1053)) ([960c00f](https://github.com/cellajs/cella/commit/960c00f1ea2fef0dfc15a759c56206afc131ec05))
* **backend:** derive membership mock ancestor IDs from the channel row ([#1048](https://github.com/cellajs/cella/issues/1048)) ([c2ef748](https://github.com/cellajs/cella/commit/c2ef7485abc1396a5716fcb17edc20e7502d0b72))
* **infra:** boot-diag empty-bucket guidance and boot.log selection ([#1049](https://github.com/cellajs/cella/issues/1049)) ([c73c84b](https://github.com/cellajs/cella/commit/c73c84b84cd115132fdb1afec74c459a7399f7a1))
* **tests:** adopt projectcampus fixes — hierarchy seeding, fixture parity, flaky cleanup ([#1046](https://github.com/cellajs/cella/issues/1046)) ([be54736](https://github.com/cellajs/cella/commit/be54736548ea3c5e79cc5b7debd17be5efe3a2a9))


### 🔧 Small improvements

* **auth:** replace deprecated arctic and [@oslojs](https://github.com/oslojs) packages ([#1052](https://github.com/cellajs/cella/issues/1052)) ([837e570](https://github.com/cellajs/cella/commit/837e570c8104e87b3c12b71f8bd8673933b12702))
* **blocknote:** align UI adapter with @blocknote/shadcn 0.53 Base UI contract ([#1055](https://github.com/cellajs/cella/issues/1055)) ([848d116](https://github.com/cellajs/cella/commit/848d1165e2cae1e61398780285343cf7afa46668))
* **infra:** shared iam-client + doc sweeps (teardown, vocabulary, credentials) ([#1045](https://github.com/cellajs/cella/issues/1045)) ([5dc9921](https://github.com/cellajs/cella/commit/5dc9921f25976196edf37129350d70ddfba3e1b6))


### 📖 Documentation

* **cella:** sync skill routes commit/ship through the CLI, never plain git ([#1042](https://github.com/cellajs/cella/issues/1042)) ([5fe6e8d](https://github.com/cellajs/cella/commit/5fe6e8d2c620df48d135a86a5204253bf8dfb453))
* **skills:** consolidate agent skills into cella/skills ([#1043](https://github.com/cellajs/cella/issues/1043)) ([d4d080e](https://github.com/cellajs/cella/commit/d4d080ef481721e94dd41efc518c635d9d622111))


### 🧹 Chores

* **deps:** minor/patch dependency sweep, hold @hono/zod-openapi at 1.5.1 ([#1051](https://github.com/cellajs/cella/issues/1051)) ([a75b7f2](https://github.com/cellajs/cella/commit/a75b7f2ff24d646047c5a773302c5184fc93d9b6))
* **lint:** clear comment-style backlog and make the style pass blocking ([#1050](https://github.com/cellajs/cella/issues/1050)) ([93bbd15](https://github.com/cellajs/cella/commit/93bbd15887e60f31b6484d3559ea122e2092cdd7))

## [0.9.0](https://github.com/cellajs/cella/compare/0.8.8...0.9.0) (2026-08-13)


### ⚠ BREAKING CHANGES

* **infra:** deploy vocabulary roll — start-first/stop-first, pathPrefix, storeOutputs ([#1038](https://github.com/cellajs/cella/issues/1038))

### 🎉 New features

* **infra:** deploy vocabulary roll — start-first/stop-first, pathPrefix, storeOutputs ([#1038](https://github.com/cellajs/cella/issues/1038)) ([373534c](https://github.com/cellajs/cella/commit/373534c67435643513b252f4c22473b6a0c7ba5f))


### 🐞 Bug fixes

* **deploy:** stop freezing stable-named /static files behind immutable caches ([#1040](https://github.com/cellajs/cella/issues/1040)) ([7efca24](https://github.com/cellajs/cella/commit/7efca249a71a2ca79130bb77bb2d558816f91a19))


### 🔧 Small improvements

* **infra:** smoke derives URLs by role + boot service-key tests ([#1039](https://github.com/cellajs/cella/issues/1039)) ([4e88635](https://github.com/cellajs/cella/commit/4e88635ed5fdb26bba79c3c1141f3bc9f25f7d61))

## [0.8.8](https://github.com/cellajs/cella/compare/0.8.7...0.8.8) (2026-08-12)


### 🎉 New features

* **infra:** P3 — status provider registry, generic store outputs, config-owned telemetry sink ([#1036](https://github.com/cellajs/cella/issues/1036)) ([6a8484f](https://github.com/cellajs/cella/commit/6a8484f71e8ecf2e5a14381151794ef3d4f37c3b))

## [0.8.7](https://github.com/cellajs/cella/compare/0.8.6...0.8.7) (2026-08-11)


### 🎉 New features

* **infra:** P2 — external stores + optional app object storage ([#1034](https://github.com/cellajs/cella/issues/1034)) ([d09a693](https://github.com/cellajs/cella/commit/d09a6938fb5bab6dc029478ffa11d2c5afeb4b96))


### 🐞 Bug fixes

* **config:** explicit .ts import extensions for Vite 8 'native' config loader ([#1033](https://github.com/cellajs/cella/issues/1033)) ([f599554](https://github.com/cellajs/cella/commit/f599554b897635fb3f057d63d3efb9818c496084))

## [0.8.6](https://github.com/cellajs/cella/compare/0.8.5...0.8.6) (2026-08-11)


### 🐞 Bug fixes

* **infra:** correctness batch — apex derivation, teardown lock, engine gate, redis posture ([#1030](https://github.com/cellajs/cella/issues/1030)) ([7a01592](https://github.com/cellajs/cella/commit/7a01592bcc874ba173c7aed442f2bcca1cb2b7fd))
* **infra:** deploy-path guardrails — mint staging, per-rule drift, CI assert row, follower gate ([#1032](https://github.com/cellajs/cella/issues/1032)) ([50723d5](https://github.com/cellajs/cella/commit/50723d5a828448941f9369040476c9d3fcb1b693))

## [0.8.5](https://github.com/cellajs/cella/compare/0.8.4...0.8.5) (2026-08-11)


### 🔧 Small improvements

* **infra:** trim sweep — converge dedup, orphan-adoption removal, status compression ([#1028](https://github.com/cellajs/cella/issues/1028)) ([c9daca6](https://github.com/cellajs/cella/commit/c9daca6231f6e4b04ae8f95f9fe6c784db55d26b))

## [0.8.4](https://github.com/cellajs/cella/compare/0.8.3...0.8.4) (2026-08-10)


### 🐞 Bug fixes

* **infra:** release the apply stack lock on every exit + secret-paths rename ([#1025](https://github.com/cellajs/cella/issues/1025)) ([7aac0ab](https://github.com/cellajs/cella/commit/7aac0ab315c5c17e8a2c3b20cea551f17d1b53c8))
* **infra:** tolerate migration-owned privilege drift on managed postgres ([#1027](https://github.com/cellajs/cella/issues/1027)) ([2c51730](https://github.com/cellajs/cella/commit/2c5173088e540d4bbac7e26784deb852b8e12224))

## [0.8.3](https://github.com/cellajs/cella/compare/0.8.2...0.8.3) (2026-08-10)


### 🐞 Bug fixes

* **infra:** IAM v2 migration prep — state-identity override, key-mint fix, worker health probes ([#1021](https://github.com/cellajs/cella/issues/1021)) ([542c9aa](https://github.com/cellajs/cella/commit/542c9aa31ac222085d161c8007432a49e7b9e539))
* **infra:** union folded services into the singleVM host's secret-path grant ([#1022](https://github.com/cellajs/cella/issues/1022)) ([40626c0](https://github.com/cellajs/cella/commit/40626c0cb17231e4434b5eed5428ccf453f5d987))
* yjs docker ([#1019](https://github.com/cellajs/cella/issues/1019)) ([83b95fb](https://github.com/cellajs/cella/commit/83b95fb03a4612e6b205f603a74c77de6dd13276))


### 🔧 Small improvements

* **infra:** IAM v2 only — delete the migration machinery (sweep tranche 2) ([#1024](https://github.com/cellajs/cella/issues/1024)) ([d446aca](https://github.com/cellajs/cella/commit/d446acae2e44dc2b2b5ba8a1b1c5f4096f88dc02))
* **infra:** strip IAM v1 legacy model (deprecation sweep tranche 1) ([#1023](https://github.com/cellajs/cella/issues/1023)) ([a391433](https://github.com/cellajs/cella/commit/a39143386cf95dda0167721c4752055351970278))

## [0.8.2](https://github.com/cellajs/cella/compare/0.8.1...0.8.2) (2026-08-06)


### 🐞 Bug fixes

* **deploy:** drop deleted locales/package.json from Dockerfile manifests stage ([#1016](https://github.com/cellajs/cella/issues/1016)) ([8245b23](https://github.com/cellajs/cella/commit/8245b2378bee391bdc611f636cc86f85bf99da5b))


### 🧹 Chores

* deps ([#1018](https://github.com/cellajs/cella/issues/1018)) ([8dd0912](https://github.com/cellajs/cella/commit/8dd0912c2517f7c18e747c90e3f52311638f3918))

## [0.8.1](https://github.com/cellajs/cella/compare/0.8.0...0.8.1) (2026-08-06)


### 🎉 New features

* **frontend:** resolve tab landing and disabled-tab guard at route level ([#1009](https://github.com/cellajs/cella/issues/1009)) ([17492bb](https://github.com/cellajs/cella/commit/17492bb4e8be656eff0cfe258d830f5258507519))
* **frontend:** visible header on tabs card + forward off disabled tabs ([#1007](https://github.com/cellajs/cella/issues/1007)) ([615fc5b](https://github.com/cellajs/cella/commit/615fc5ba116c374e30174038b37ceb07dec36a11))


### 🐞 Bug fixes

* **frontend:** mobile viewport height strategy ([#1005](https://github.com/cellajs/cella/issues/1005)) ([00993fc](https://github.com/cellajs/cella/commit/00993fce50d2c7e3de13b5495f453c563b127947))
* **frontend:** truthful lucide size attrs and icon-lg on menu-sheet buttons ([#1014](https://github.com/cellajs/cella/issues/1014)) ([d7fca0c](https://github.com/cellajs/cella/commit/d7fca0c9ab9bfb900022387e3bb3ce3dbc388abb))
* **i18n:** repair locales pipeline, i18n Ally resolution, and remove dead locale code ([#1008](https://github.com/cellajs/cella/issues/1008)) ([a705ea0](https://github.com/cellajs/cella/commit/a705ea01e233b902132da0af917189aeae6fb16b))
* **infra:** repair full-mode tests broken by lint consolidation ([#1006](https://github.com/cellajs/cella/issues/1006)) ([947527a](https://github.com/cellajs/cella/commit/947527a96398a04a20f6ea1a9ebc03d07e21c4ba))
* **sdk:** format generated output again by bypassing VCS ignore in biome step ([#1004](https://github.com/cellajs/cella/issues/1004)) ([06b228b](https://github.com/cellajs/cella/commit/06b228bf32c76965e920d13df7059d5f85a9bbf6))
* **tests:** repair full-mode tests broken by worker env dedupe ([#1013](https://github.com/cellajs/cella/issues/1013)) ([ea59464](https://github.com/cellajs/cella/commit/ea59464368fccc331ff8bc40ca3d706d98c996fb))


### 🔧 Small improvements

* **frontend:** headless settings placements ([#1002](https://github.com/cellajs/cella/issues/1002)) ([ca17240](https://github.com/cellajs/cella/commit/ca172401a7ed863349aa9652185467eae2cec974))
* **tenants:** remove manual tenant creation ([#1003](https://github.com/cellajs/cella/issues/1003)) ([df8f14d](https://github.com/cellajs/cella/commit/df8f14dcb3c0f6427696030b829efa210732e8eb))
* **workers:** align backend/cdc/yjs on drizzle + hono ([#1010](https://github.com/cellajs/cella/issues/1010)) ([9fafabc](https://github.com/cellajs/cella/commit/9fafabc5c1af3e25a2c3e9f325cf12fbaa9fff09))


### 🧹 Chores

* **lint:** consolidate style checks + simplify biome and extend lint scope ([#1000](https://github.com/cellajs/cella/issues/1000)) ([cdcb70a](https://github.com/cellajs/cella/commit/cdcb70a2e466d22af9c347403a8ae61d48db6e50))
* **workers:** dedupe cdc/yjs env, poll defaults, health lag + test gating ([#1011](https://github.com/cellajs/cella/issues/1011)) ([2e18afc](https://github.com/cellajs/cella/commit/2e18afc1711acee5e9080f564866e01742d52d48))

## [0.8.0](https://github.com/cellajs/cella/compare/0.7.0...0.8.0) (2026-08-04)


### ⚠ BREAKING CHANGES

* **infra:** IAM model rewrite — per-mode principals, per-deploy keys, path-scoped secrets ([#989](https://github.com/cellajs/cella/issues/989))

### 🎉 New features

* **infra:** IAM model rewrite — per-mode principals, per-deploy keys, path-scoped secrets ([#989](https://github.com/cellajs/cella/issues/989)) ([9285462](https://github.com/cellajs/cella/commit/9285462b9a81957626403db0c13c96bfd014ad1a))


### 🐞 Bug fixes

* **backend:** include committed tree hash in openapi cache fingerprint ([#996](https://github.com/cellajs/cella/issues/996)) ([bacf716](https://github.com/cellajs/cella/commit/bacf71644dd5113339fd53adbedc2a38597ee611))
* **frontend:** build onboarding steps lazily to avoid i18n module-load crash ([#994](https://github.com/cellajs/cella/issues/994)) ([ff08151](https://github.com/cellajs/cella/commit/ff08151a1c5239a2f89383e35343a8da00ae3776))
* **frontend:** splice blocknote-created attachments into the canonical list cache ([#998](https://github.com/cellajs/cella/issues/998)) ([b73ef8d](https://github.com/cellajs/cella/commit/b73ef8da048bdfa0b627b794a708a7cccb0bf29d))
* **infra:** ignore rule drift on bootstrap-owned VM IAM policies (CI can't write IAM) ([#991](https://github.com/cellajs/cella/issues/991)) ([5578728](https://github.com/cellajs/cella/commit/55787282b219b236fb9f3e650807ccdc1c0cb71c))
* **infra:** prefer AWS_* credentials for the control-store read ([#995](https://github.com/cellajs/cella/issues/995)) ([3afe85a](https://github.com/cellajs/cella/commit/3afe85a452a41e754a5e01453abd5ffbbe468e96))
* **infra:** treat extra read-only VM grants as benign drift, not a deploy blocker ([#993](https://github.com/cellajs/cella/issues/993)) ([f02dfda](https://github.com/cellajs/cella/commit/f02dfda462293960ecb7d483959e9179d233723d))
* **infra:** valid Scaleway CORS action casing + keep legacy vm-reader policy unchanged ([#990](https://github.com/cellajs/cella/issues/990)) ([4db9269](https://github.com/cellajs/cella/commit/4db9269dd216f9d3f3271a4daa68d667753f5193))


### 📖 Documentation

* deprecate child-side product host FKs in favor of owned embeddings ([#999](https://github.com/cellajs/cella/issues/999)) ([97230a4](https://github.com/cellajs/cella/commit/97230a47c1bf4ca92e29261719396b41ec6466a5))


### 🧹 Chores

* **infra:** decommission staging — drop committed stack config ([#987](https://github.com/cellajs/cella/issues/987)) ([8f5c526](https://github.com/cellajs/cella/commit/8f5c526dc8b0eee05dbd54740562b8d7c9db38ba))
* **infra:** one-off workflow to prune a URN from Pulumi state ([#992](https://github.com/cellajs/cella/issues/992)) ([ecbf312](https://github.com/cellajs/cella/commit/ecbf312a264851d3811b51e04a0530a1853dca02))
* ui improvements and fixes ([#997](https://github.com/cellajs/cella/issues/997)) ([82c7616](https://github.com/cellajs/cella/commit/82c761671c432502a3ba4095919ef42dd046865c))

## [0.7.0](https://github.com/cellajs/cella/compare/0.6.1...0.7.0) (2026-07-30)


### ⚠ BREAKING CHANGES

* move cella config/manifest/migrations into the cella/ folder ([#983](https://github.com/cellajs/cella/issues/983))
* **frontend:** frontend module registry, UI placements, and per-channel tools config ([#982](https://github.com/cellajs/cella/issues/982))
* collapse attachment variant keys into a single jsonb map ([#979](https://github.com/cellajs/cella/issues/979))

### 🎉 New features

* collapse attachment variant keys into a single jsonb map ([#979](https://github.com/cellajs/cella/issues/979)) ([d3c3c63](https://github.com/cellajs/cella/commit/d3c3c63b57d28c52f8ef224f5f608073f9bd1a8e))
* **frontend:** frontend module registry, UI placements, and per-channel tools config ([#982](https://github.com/cellajs/cella/issues/982)) ([2f249fa](https://github.com/cellajs/cella/commit/2f249fa6bcc3d740fd1bf656033ee1440dbdc6d3))
* **frontend:** gate Maple telemetry on a dedicated VITE_MAPLE opt-in ([#984](https://github.com/cellajs/cella/issues/984)) ([901ee4a](https://github.com/cellajs/cella/commit/901ee4a2e350a2d3a5b8e8f4f9dc0da11dc79d8c))
* **infra:** general-purpose plan phases P1-P3.5 (de-cella gate, store plugins, secret ownership, container collocation) ([#980](https://github.com/cellajs/cella/issues/980)) ([7bac7b0](https://github.com/cellajs/cella/commit/7bac7b0657c7edab99dae2d6a9c70b2ff2b5257f))
* move cella config/manifest/migrations into the cella/ folder ([#983](https://github.com/cellajs/cella/issues/983)) ([ff757dc](https://github.com/cellajs/cella/commit/ff757dcabf23d553399c6bcd19a3441ffbae17ea))


### 🐞 Bug fixes

* **backend:** adopt entity-agnostic raak contributions (audit-user, oauth, schema tests) ([#977](https://github.com/cellajs/cella/issues/977)) ([3829feb](https://github.com/cellajs/cella/commit/3829feb1e72f014f99c7056090e534060746b0cf))
* **backend:** make requests unique-signup index deploy-safe and race-safe ([#985](https://github.com/cellajs/cella/issues/985)) ([d8b34fb](https://github.com/cellajs/cella/commit/d8b34fbf74bcef2412f35e3b7b41c9a542733501))
* **infra:** keep DB-exposure state out of the committed stack config ([#974](https://github.com/cellajs/cella/issues/974)) ([11bad96](https://github.com/cellajs/cella/commit/11bad969de1d1c9f2a16a62199dea9b87af903be))


### 🏗️ Build & deps

* **deploy:** gate staging auto-deploy on a bootstrapped stack ([#978](https://github.com/cellajs/cella/issues/978)) ([1dd8377](https://github.com/cellajs/cella/commit/1dd8377fd6f6510da45ee6fd852e0e7ef4c2d245))


### 🧹 Chores

* adopt raak generic contributions (docs, schema exports, cella-sync skill) ([#981](https://github.com/cellajs/cella/issues/981)) ([cc97795](https://github.com/cellajs/cella/commit/cc97795ca4c8b96886dbeba12b0c138aea2c59ef))
* **ci:** always deploy staging on push to main; remove infra-preview workflow ([#973](https://github.com/cellajs/cella/issues/973)) ([42e4a65](https://github.com/cellajs/cella/commit/42e4a651fee851152ee911576592f7a5c8b34a9d))
* fix tests ([#986](https://github.com/cellajs/cella/issues/986)) ([4271079](https://github.com/cellajs/cella/commit/4271079e43f3dfda8d49e05a5883708fb93e2ace))
* **infra:** run staging single-VM (co-host cdc in the backend) ([#976](https://github.com/cellajs/cella/issues/976)) ([3e4c3e8](https://github.com/cellajs/cella/commit/3e4c3e857d42554dc72fd39d647f47c08962d684))

## [0.6.1](https://github.com/cellajs/cella/compare/0.6.0...0.6.1) (2026-07-29)


### 🔧 Small improvements

* **backend:** adopt raak upstream (module hub, mutation bus, query/schema conventions, drop OperationResult) ([#972](https://github.com/cellajs/cella/issues/972)) ([317730b](https://github.com/cellajs/cella/commit/317730b95e578f58c231709be54f121906deaa7f))
* faster SW install and reload UX (serwist, chunking, compression) ([#961](https://github.com/cellajs/cella/issues/961)) ([201e68d](https://github.com/cellajs/cella/commit/201e68dc55e6c9e72ec6e973386258cbd155dfe4))
* **frontend:** rename appDb/appKvStore family to localUser* ([#969](https://github.com/cellajs/cella/issues/969)) ([e1a6ee5](https://github.com/cellajs/cella/commit/e1a6ee5b9a97bb5ce9e626c73c9729542a98d5da))
* **frontend:** use vanilla stores for imperative state ([#967](https://github.com/cellajs/cella/issues/967)) ([a5a2fad](https://github.com/cellajs/cella/commit/a5a2fad188f228f934dbb9c2d8e72c8bb9e5e645))
* remove unused onboarding demo-data seed hook ([#968](https://github.com/cellajs/cella/issues/968)) ([ff0ff9d](https://github.com/cellajs/cella/commit/ff0ff9d2abbab5b0caf92ef349f6603db9632305))
* standardize template app vocabulary ([#970](https://github.com/cellajs/cella/issues/970)) ([74283bb](https://github.com/cellajs/cella/commit/74283bbd7c62afeae4498ac5f50b1440f86791d2))


### 🧹 Chores

* flag agent-associated prose ([#963](https://github.com/cellajs/cella/issues/963)) ([159d724](https://github.com/cellajs/cella/commit/159d7247a34c085630350c142a41d8ffce51f6b9))
* triage raak contributions pull (keep template gains, drop domain leaks) ([#965](https://github.com/cellajs/cella/issues/965)) ([f88e045](https://github.com/cellajs/cella/commit/f88e045134c257df3d1f3ee7d43ce423a38cf490))
* update deps ([#971](https://github.com/cellajs/cella/issues/971)) ([d70ec57](https://github.com/cellajs/cella/commit/d70ec57959ca80ee4d28eef0ab3f3fd2a4d87916))

## [0.6.0](https://github.com/cellajs/cella/compare/0.5.7...0.6.0) (2026-07-23)


### ⚠ BREAKING CHANGES

* batch presigned URLs replace the single presign endpoint ([#957](https://github.com/cellajs/cella/issues/957))
* replace unchecked type assertions that hid real defects ([#956](https://github.com/cellajs/cella/issues/956))
* rename attachment storage flag to publicBucket ([#954](https://github.com/cellajs/cella/issues/954))
* consolidate permission vocabulary onto repo terms ([#955](https://github.com/cellajs/cella/issues/955))
* public read is a flag, not a mode ([#953](https://github.com/cellajs/cella/issues/953))
* hierarchy as single source of truth (config, guards, row location, path column) ([#952](https://github.com/cellajs/cella/issues/952))
* breaking change migration structure renewal and renaming ([#942](https://github.com/cellajs/cella/issues/942))

### 🎉 New features

* batch presigned URLs replace the single presign endpoint ([#957](https://github.com/cellajs/cella/issues/957)) ([26208e6](https://github.com/cellajs/cella/commit/26208e657d67a55942a019372994592a788ee4cd))
* breaking change migration structure renewal and renaming ([#942](https://github.com/cellajs/cella/issues/942)) ([b4b40b8](https://github.com/cellajs/cella/commit/b4b40b806bd2b9ec8a747168fc4b074b2cca6b11))
* hierarchy as single source of truth (config, guards, row location, path column) ([#952](https://github.com/cellajs/cella/issues/952)) ([df50a60](https://github.com/cellajs/cella/commit/df50a6025c9af3ee73ca4e51864b50bb69ceab34))
* owned embedding lifecycle ([#960](https://github.com/cellajs/cella/issues/960)) ([51028b6](https://github.com/cellajs/cella/commit/51028b67e5a1cd17c378bee4d4d55af24b408029))


### 🐞 Bug fixes

* index each list item as its own docs search section ([#959](https://github.com/cellajs/cella/issues/959)) ([4cf7fe5](https://github.com/cellajs/cella/commit/4cf7fe53dd16ecf35588360d3181fdaa80812420))
* release tab leadership when leaving the app ([#951](https://github.com/cellajs/cella/issues/951)) ([baa38f0](https://github.com/cellajs/cella/commit/baa38f0e4b1ce5c36f0729eecdd1376cf70946a6))
* seq necessary in catchup tests ([#946](https://github.com/cellajs/cella/issues/946)) ([c908b99](https://github.com/cellajs/cella/commit/c908b990ce115695882fdbb83027763f5e0fa310))


### 🔧 Small improvements

* align toaster API with Sonner ([#949](https://github.com/cellajs/cella/issues/949)) ([5c375ca](https://github.com/cellajs/cella/commit/5c375cae665fec920e5f4740853b6aad0732d51e))
* back to useMutation, cleanup query.ts files ([#950](https://github.com/cellajs/cella/issues/950)) ([0538424](https://github.com/cellajs/cella/commit/0538424b2ede266a0b0be1011549e57e0b682376))
* consolidate permission vocabulary onto repo terms ([#955](https://github.com/cellajs/cella/issues/955)) ([1642b7d](https://github.com/cellajs/cella/commit/1642b7dc9dbd857726d2a0f317dda68178d7251f))
* improve app alignment ([#943](https://github.com/cellajs/cella/issues/943)) ([6f21e07](https://github.com/cellajs/cella/commit/6f21e0737de691963c31250ae7ea09ff543b239d))
* public read is a flag, not a mode ([#953](https://github.com/cellajs/cella/issues/953)) ([702955a](https://github.com/cellajs/cella/commit/702955ae853afd44f21f0b3d78cb6ccd8f445597))
* rename attachment storage flag to publicBucket ([#954](https://github.com/cellajs/cella/issues/954)) ([32847fe](https://github.com/cellajs/cella/commit/32847feb1f8076f615b0ed07beff29ef41b11720))
* replace unchecked type assertions that hid real defects ([#956](https://github.com/cellajs/cella/issues/956)) ([dad46cb](https://github.com/cellajs/cella/commit/dad46cb09d11915af13109016ee9a6a535c5c4ca))


### 🧹 Chores

* imporve add entity todo list md ([#958](https://github.com/cellajs/cella/issues/958)) ([8a71bc8](https://github.com/cellajs/cella/commit/8a71bc872541ee7f46323fac77834e96a9069168))
* improve embedded propagation hints naming ([#947](https://github.com/cellajs/cella/issues/947)) ([a7ee2d2](https://github.com/cellajs/cella/commit/a7ee2d200e07f1711b587f116a7fae2d0b045cd5))
* tighten long-form source comments ([#948](https://github.com/cellajs/cella/issues/948)) ([070d340](https://github.com/cellajs/cella/commit/070d3407d67695ce4ada072cb67431d8881df549))
* update deps ([#945](https://github.com/cellajs/cella/issues/945)) ([6baf179](https://github.com/cellajs/cella/commit/6baf1796cf5f76b9eb475eb7aff7941c12fbb9b9))

## [0.5.7](https://github.com/cellajs/cella/compare/0.5.6...0.5.7) (2026-07-21)


### 🎉 New features

* infra expose db ([#936](https://github.com/cellajs/cella/issues/936)) ([5e83ccb](https://github.com/cellajs/cella/commit/5e83ccb9e3177fddbb51aefd103f46d024a78a67))


### 🐞 Bug fixes

* **cdc:** guard replication-slot self-heal against unwanted recreation ([#939](https://github.com/cellajs/cella/issues/939)) ([51e718e](https://github.com/cellajs/cella/commit/51e718efe0108238abfcd079ff26033899716ae8))


### 🧹 Chores

* code styling alignment query.ts ([#940](https://github.com/cellajs/cella/issues/940)) ([5f721bf](https://github.com/cellajs/cella/commit/5f721bffeacfba3d12ede078e5b5abe0dec5fcac))
* **docs:** drop references to gitignored .todos/ planning files ([#938](https://github.com/cellajs/cella/issues/938)) ([e1aaea2](https://github.com/cellajs/cella/commit/e1aaea2d6c0559ee8abda4f27282dba000e56092))
* rewriting and renaming ([#941](https://github.com/cellajs/cella/issues/941)) ([9f434ff](https://github.com/cellajs/cella/commit/9f434ffc73435fa91fa23d21e61ed6fea2a89339))

## [0.5.6](https://github.com/cellajs/cella/compare/0.5.5...0.5.6) (2026-07-21)


### 🔧 Small improvements

* **frontend:** consolidate the offline-mutation template into shared primitives ([#934](https://github.com/cellajs/cella/issues/934)) ([1027ac8](https://github.com/cellajs/cella/commit/1027ac868fe2da15c4aea0a6a195ffc9cb168bbd))

## [0.5.5](https://github.com/cellajs/cella/compare/0.5.4...0.5.5) (2026-07-20)


### 🎉 New features

* **infra:** expose/unexpose database publicly via the infra CLI ([#932](https://github.com/cellajs/cella/issues/932)) ([bb1b97e](https://github.com/cellajs/cella/commit/bb1b97e1456f14ccb86142c521210eab5542e640))

## [0.5.4](https://github.com/cellajs/cella/compare/0.5.3...0.5.4) (2026-07-20)


### 🐞 Bug fixes

* sw catches all api requests ([#930](https://github.com/cellajs/cella/issues/930)) ([3d6aae8](https://github.com/cellajs/cella/commit/3d6aae89cca5a4d181f5b4d4094c4c3de7657e17))

## [0.5.3](https://github.com/cellajs/cella/compare/0.5.2...0.5.3) (2026-07-20)


### 🎉 New features

* seed system admin from ADMIN_EMAIL in the migrate companion ([#928](https://github.com/cellajs/cella/issues/928)) ([4b4a5a1](https://github.com/cellajs/cella/commit/4b4a5a1b4cccc098fd92a0ba705514e950d36e92))

## [0.5.2](https://github.com/cellajs/cella/compare/0.5.1...0.5.2) (2026-07-20)


### 🏗️ Build & deps

* gate heavy suites on the release PR instead of a deploy-time release-gate ([#925](https://github.com/cellajs/cella/issues/925)) ([e667ae2](https://github.com/cellajs/cella/commit/e667ae2687b7647fa81c288519524ac00b72ff1b))


### 🧹 Chores

* remove hidden true from feat branch types ([#926](https://github.com/cellajs/cella/issues/926)) ([25fcd43](https://github.com/cellajs/cella/commit/25fcd432d86abc48b3ea3e4e4310ecf99136f5e9))

## [0.5.1](https://github.com/cellajs/cella/compare/0.5.0...0.5.1) (2026-07-20)


### 🐞 Bug fixes

* **bench:** make artillery run on Node 24 ([#923](https://github.com/cellajs/cella/issues/923)) ([cce6a82](https://github.com/cellajs/cella/commit/cce6a826ef75a02260a99821dd58cda9d1413237))
* **frontend:** rename multi_tenancy.md to MULTI_TENANCY.md so MDX transforms it ([#921](https://github.com/cellajs/cella/issues/921)) ([d8a3659](https://github.com/cellajs/cella/commit/d8a365934f4e0359a4e59903d5cee824936fbd3f))
* **frontend:** strip text/background color styles on paste in blocknote ([#924](https://github.com/cellajs/cella/issues/924)) ([bab68d7](https://github.com/cellajs/cella/commit/bab68d7d0fe0de1a76309352ff55e02d8f86b230))

## [0.5.0](https://github.com/cellajs/cella/compare/0.4.1...0.5.0) (2026-07-20)


### ⚠ BREAKING CHANGES

* Sequence sync ([#917](https://github.com/cellajs/cella/issues/917))

### 🎉 New features

* **infra:** add "Reset database" CLI task ([#908](https://github.com/cellajs/cella/issues/908)) ([38ef7f6](https://github.com/cellajs/cella/commit/38ef7f6bb21e5218f7e49fd3ae3f2c08933af9bb))
* per-org feature flags, config-driven default org tab, declarative navTab gating ([#911](https://github.com/cellajs/cella/issues/911)) ([d25fa49](https://github.com/cellajs/cella/commit/d25fa49c59fa8cf0badb31ba47a7d8e6d9ac35c7))
* self-heal orphaned deletes in the apply retry loop ([#914](https://github.com/cellajs/cella/issues/914)) ([c566867](https://github.com/cellajs/cella/commit/c566867687a6b0a3ad53c1256ef1ad60b6ecfe0f))
* Sequence sync ([#917](https://github.com/cellajs/cella/issues/917)) ([bb841b0](https://github.com/cellajs/cella/commit/bb841b027fc2bbaa59ac6c6a53bbb5e9e23f1354))
* **system:** send security email on system role changes via CDC ([#910](https://github.com/cellajs/cella/issues/910)) ([c03eefd](https://github.com/cellajs/cella/commit/c03eefd688c892359bd84226702c12385321d086))


### 🐞 Bug fixes

* release and deploy pipeline fix ([#920](https://github.com/cellajs/cella/issues/920)) ([c01ebcc](https://github.com/cellajs/cella/commit/c01ebcce960ff3ad48e333e81ab75a7c8ebf5c3d))
* repair silently-failing side-effect migrations, add migrate-time verification ([#905](https://github.com/cellajs/cella/issues/905)) ([38310cd](https://github.com/cellajs/cella/commit/38310cdb1fbf03d68a6f63c48d1e3d478bdf175b))
* **sync:** derive sub-org viewing from observed queries, not route params ([#912](https://github.com/cellajs/cella/issues/912)) ([ecdd670](https://github.com/cellajs/cella/commit/ecdd6704c47dfac9c3dbef26f14dcd39a1249314))
* **test:** drop the impossible ON CONFLICT arbiter on partitioned seen_by ([#909](https://github.com/cellajs/cella/issues/909)) ([aebe4c3](https://github.com/cellajs/cella/commit/aebe4c3dad9891d54f40d832460b6a1fd6ec4bbd))


### 🔧 Small improvements

* **attachment:** rework the frontend attachment module ([#906](https://github.com/cellajs/cella/issues/906)) ([59f4998](https://github.com/cellajs/cella/commit/59f4998015a39335da8305aadec3f035bb0f13c2))
* filename fixes to ignore files in routes ([c0b480c](https://github.com/cellajs/cella/commit/c0b480cbf6ea8a7b6f172e335a7f963b60587067))
* filename fixes to ignore files in routes ([c52a9cc](https://github.com/cellajs/cella/commit/c52a9cc20c73d5a79e42c23db5432be20a446aef))
* **query:** key canonical lists by home channel, replacing ances… ([#915](https://github.com/cellajs/cella/issues/915)) ([373510e](https://github.com/cellajs/cella/commit/373510e4c338627bdb86799a0da365be72659485))
* replace ambiguous jargon in comments with plain naming ([#903](https://github.com/cellajs/cella/issues/903)) ([4045677](https://github.com/cellajs/cella/commit/4045677a7cf827f12a12e2be03acfc2fae8d31a0))

## [0.4.1](https://github.com/cellajs/cella/compare/0.4.0...0.4.1) (2026-07-17)

### 🎉 New features

- add cdc-attachment load test ([723ae68](https://github.com/cellajs/cella/commit/723ae6802030824689a216df8e995a852673959f))
- sync lazy overhaul ([#902](https://github.com/cellajs/cella/issues/902)) ([7ffe773](https://github.com/cellajs/cella/commit/7ffe7730ccbfa0412927c7524781c438dd9114f7))

### 🐞 Bug fixes

- **backend:** key spam limiter per user with IP fallback ([#894](https://github.com/cellajs/cella/issues/894)) ([88ed049](https://github.com/cellajs/cella/commit/88ed04956861ce5674e7df9c143551a14d0c8ff0))
- bench fix due to same origin breaking it ([ff9740d](https://github.com/cellajs/cella/commit/ff9740d621093355004477ecb53966d03e4f693a))
- enforce rate limiter budgets, partman schema parity, session device grouping ([#901](https://github.com/cellajs/cella/issues/901)) ([5de16a1](https://github.com/cellajs/cella/commit/5de16a12128b72e973c019db7130b58177ade5d4))

### 🔧 Small improvements

- **backend:** source list total from channel counter, skip COUNT(*) on delta sync ([#896](https://github.com/cellajs/cella/issues/896)) ([fabd8f4](https://github.com/cellajs/cella/commit/fabd8f46edbe0056cfa419d4a9ccf9377a39769d))
- collect side-effect migrations into one combined folder ([#900](https://github.com/cellajs/cella/issues/900)) ([f583f0f](https://github.com/cellajs/cella/commit/f583f0f6f133a1e058fa9f39d5afdacbbf7888b2))
- densify self-evident comments in emails/bench/tests/scripts/mocks ([#893](https://github.com/cellajs/cella/issues/893)) ([84fa08d](https://github.com/cellajs/cella/commit/84fa08da84ab8b045f048c10294a52fa88ef7841))
- **frontend:** densify/remove comments where the code is self-evident ([#891](https://github.com/cellajs/cella/issues/891)) ([d578d91](https://github.com/cellajs/cella/commit/d578d9127741aac52a48f5af5499db3a62fc171f))
- move type ([717c880](https://github.com/cellajs/cella/commit/717c880496ceea52827176169f1dd60cd224039c))
- **permissions:** collapse row conditions to a name union ([#899](https://github.com/cellajs/cella/issues/899)) ([d218b69](https://github.com/cellajs/cella/commit/d218b6991ca4a88a88d3abfbbd88876b39be4318))
- replace ([34bd720](https://github.com/cellajs/cella/commit/34bd720f7c2e96d619ac1ea237c5f3b1f512514a))
- **types:** tighten entityType: string seams to named entity types ([#897](https://github.com/cellajs/cella/issues/897)) ([1923f30](https://github.com/cellajs/cella/commit/1923f30c850e378e1439af1a314f79535bbc4626))
- **types:** tighten role: string seams to EntityRole (+ unbreak main) ([#898](https://github.com/cellajs/cella/issues/898)) ([c7ed1c7](https://github.com/cellajs/cella/commit/c7ed1c71e2745197653442f078a3375879d43839))

### ⏪ Reverts

- batchToken and batchCache ([16ce523](https://github.com/cellajs/cella/commit/16ce523f28d6a81d2d77a98cf86a6a7164dd77fb))

## [0.4.0](https://github.com/cellajs/cella/compare/0.3.5...0.4.0) (2026-07-15)

### ⚠ BREAKING CHANGES

- large permission refactor ([#883](https://github.com/cellajs/cella/issues/883))

### 🎉 New features

- **docs:** derive page updatedAt from git (page + imported docs) ([#887](https://github.com/cellajs/cella/issues/887)) ([7064e0e](https://github.com/cellajs/cella/commit/7064e0ea577581c2d2e6285eab54159ff3119c60))
- **infra:** LB path-begin routes for same-origin migration (option A, phase 0+1) ([#880](https://github.com/cellajs/cella/issues/880)) ([7c5b2fd](https://github.com/cellajs/cella/commit/7c5b2fd47ef73f19a8ba38c4063eb50d1b2c1485))
- **permissions:** configuration-safe hazard fixes + public-read migration tooling ([#885](https://github.com/cellajs/cella/issues/885)) ([88161b7](https://github.com/cellajs/cella/commit/88161b7b58c3ea6195e8f72a7ba01cace5fbc9b3))
- same-origin phases 2+3 — url flip, cookie hardening, legacy-host redirects ([#881](https://github.com/cellajs/cella/issues/881)) ([5af3e56](https://github.com/cellajs/cella/commit/5af3e5606eb0a933f37ec677f3d8470c8d4e9ac1))

### 🐞 Bug fixes

- **auth:** preserve /api prefix in token links & add router not-found fallback ([#889](https://github.com/cellajs/cella/issues/889)) ([d64cc6a](https://github.com/cellajs/cella/commit/d64cc6a9cd61ec83c05874c2c6668faee9e642c0))
- fix sync engine diagram ([92a2db3](https://github.com/cellajs/cella/commit/92a2db347b396aabef347749880e1e7eb7868bdb))
- permission part one ([338a06c](https://github.com/cellajs/cella/commit/338a06c708ae73c1210e8e6f9e34fc59ebca0f83))

### 🔧 Small improvements

- code (comments) cleanup ([37c7d4f](https://github.com/cellajs/cella/commit/37c7d4fb2d9579d875a38243481185436af40bdc))
- densify comment blocks, drop decorative banners ([#888](https://github.com/cellajs/cella/issues/888)) ([625a32e](https://github.com/cellajs/cella/commit/625a32e44513cdb14f773aaf0dd1377a18c414fd))
- large permission refactor ([#883](https://github.com/cellajs/cella/issues/883)) ([6539f4f](https://github.com/cellajs/cella/commit/6539f4fd93203d29bdf6d627a23782b082970b5e))
- narrow over-wide `| undefined` types ([#886](https://github.com/cellajs/cella/issues/886)) ([240f003](https://github.com/cellajs/cella/commit/240f003df2766fcdcd36290f7c77e3ce0d7e032b))
- permissions ([cd99688](https://github.com/cellajs/cella/commit/cd9968813db042ac4c9c52e9cbce40436c11eb27))
- permissions ([55276a1](https://github.com/cellajs/cella/commit/55276a182086013b0770b8227194cb6279bcae10))
- remove parentRow and reduce footprint PermissionDecision ([b6dc3a0](https://github.com/cellajs/cella/commit/b6dc3a07e58d218150262574a243087b47910c74))
- rename ContextEntity → ChannelEntity ([26b539a](https://github.com/cellajs/cella/commit/26b539a37ea4fb13d7d9d029816c19dadfea559b))
- use [@see](https://github.com/see) / {[@link](https://github.com/link)} JSDoc tags for code references ([#890](https://github.com/cellajs/cella/issues/890)) ([31ae1b1](https://github.com/cellajs/cella/commit/31ae1b15e7c0968c4807f39750cb4302fce70f21))

## [0.3.5](https://github.com/cellajs/cella/compare/0.3.4...0.3.5) (2026-07-14)

### 🎉 New features

- **cdc:** identify the slot holder in slot-contention retry warnings ([#878](https://github.com/cellajs/cella/issues/878)) ([1690c77](https://github.com/cellajs/cella/commit/1690c77f3d4389304b5eb585efe3fbbbe5f2f5f6))
- entity grid enrichment — member previews, activity stamps, grid polish ([#877](https://github.com/cellajs/cella/issues/877)) ([9b36fe0](https://github.com/cellajs/cella/commit/9b36fe01db9e04acab6986944f636ddbb1a670e0))
- **infra:** projectcampus go-live upstreams - singleVM hardening, cert gates, state-bucket guardrails ([#879](https://github.com/cellajs/cella/issues/879)) ([518f6fe](https://github.com/cellajs/cella/commit/518f6fe2983028b5d7c7c6318d1f3528d294b439))
- permission feature additions for projectcampus ([#873](https://github.com/cellajs/cella/issues/873)) ([2bd01e7](https://github.com/cellajs/cella/commit/2bd01e7899945f9563539853712f7f0a41f26bfb))

### 🐞 Bug fixes

- mock iso date determinism ([6f5cde0](https://github.com/cellajs/cella/commit/6f5cde01a48f3e287351b7a29a2ce633591040fb))

### ⏪ Reverts

- ignore maintenances change (no-op ignoreChanges) ([#874](https://github.com/cellajs/cella/issues/874)) ([259d80c](https://github.com/cellajs/cella/commit/259d80cb6e761349a619e9dbce9a0a24375cc446))

## [0.3.4](https://github.com/cellajs/cella/compare/0.3.3...0.3.4) (2026-07-09)

### 🐞 Bug fixes

- ignore maintenances change ([2620872](https://github.com/cellajs/cella/commit/2620872acbd70364403c7cfef1ae1e116e517a43))

## [0.3.3](https://github.com/cellajs/cella/compare/0.3.2...0.3.3) (2026-07-09)

### 🐞 Bug fixes

- fix lockfile ([#870](https://github.com/cellajs/cella/issues/870)) ([36664c4](https://github.com/cellajs/cella/commit/36664c4ba35ebd5bb801ecc34278000adaae77f7))

## [0.3.2](https://github.com/cellajs/cella/compare/0.3.1...0.3.2) (2026-07-09)

### 🎉 New features

- docs search and ui improvements ([#867](https://github.com/cellajs/cella/issues/867)) ([f2e077a](https://github.com/cellajs/cella/commit/f2e077a37a68ad667758699c7134a95340d57b5a))

## [0.3.1](https://github.com/cellajs/cella/compare/0.3.0...0.3.1) (2026-07-08)

### 🎉 New features

- deploy improvements and fix for otel core override deploy ([#864](https://github.com/cellajs/cella/issues/864)) ([0370090](https://github.com/cellajs/cella/commit/0370090a81d3376b0393a3d2e76b2843135e99bf))

## [0.3.0](https://github.com/cellajs/cella/compare/0.2.2...0.3.0) (2026-07-08)

### ⚠ BREAKING CHANGES

- Worktree mdx pages instead of db model for pages ([#855](https://github.com/cellajs/cella/issues/855))

### 🎉 New features

- autolink repo file paths in docs inline code to GitHub ([#858](https://github.com/cellajs/cella/issues/858)) ([3a3b382](https://github.com/cellajs/cella/commit/3a3b3822309c0e1eace2aaed6ba863be322b59b2))
- deepest-non-null-ancestor context attribution + template-adapted tests ([7f6d940](https://github.com/cellajs/cella/commit/7f6d9402e2ffef0139871c47466c04f1046b8fde))
- app alignment ([ded27fb](https://github.com/cellajs/cella/commit/ded27fb10e183ab4696e5d9723b47b589d0f97f6))
- many improvements ([#862](https://github.com/cellajs/cella/issues/862)) ([6b1ca8f](https://github.com/cellajs/cella/commit/6b1ca8f33d7f6ab41e38ac022ec3bef7cc6ccd34))
- mdx consolidation ([#857](https://github.com/cellajs/cella/issues/857)) ([5e69279](https://github.com/cellajs/cella/commit/5e69279581d9e728e45ba57cd64eaf7df45fff2f))
- **permissions:** topology seam + wide-fixture kit for configuration-independent engine tests ([#861](https://github.com/cellajs/cella/issues/861)) ([d4c3de6](https://github.com/cellajs/cella/commit/d4c3de6e857479ec67915f92b61167cada1e36aa))
- Worktree mdx pages instead of db model for pages ([#855](https://github.com/cellajs/cella/issues/855)) ([d7af703](https://github.com/cellajs/cella/commit/d7af70330ec915ee3725ed9530e5e0e9476e995a))

### 🐞 Bug fixes

- docs imporvements ([049df07](https://github.com/cellajs/cella/commit/049df0719a5e7e07649f7a698494ffc8a9c1bf7d))
- omitted generated changes from page model removal ([91a4c10](https://github.com/cellajs/cella/commit/91a4c10fe392e261d2a398629c6b4ead9f0f590a))

### 🔧 Small improvements

- **cdc:** cleanup + typed wire contract + app-stream kind discriminant ([#859](https://github.com/cellajs/cella/issues/859)) ([4b2bf27](https://github.com/cellajs/cella/commit/4b2bf2716c421bd488d4780d3d3fe8c3b62f4ff9))
- consolidate service Dockerfiles into one multi-target file ([#851](https://github.com/cellajs/cella/issues/851)) ([0e055b4](https://github.com/cellajs/cella/commit/0e055b4b3bbb808139631f18b99b635e9cab4244))

### 📖 Documentation

- document the lens schema-evolution system ([c44cde2](https://github.com/cellajs/cella/commit/c44cde28e62b37d3115232ff9b29308b617f87d9))

## [0.2.2](https://github.com/cellajs/cella/compare/0.2.1...0.2.2) (2026-07-05)

### 🎉 New features

- encrypt TOTP secrets at rest ([#847](https://github.com/cellajs/cella/issues/847)) ([9f16d90](https://github.com/cellajs/cella/commit/9f16d90f929bd31e61a63a9d106e91ccb3c2944d))
- log refactor ([#848](https://github.com/cellajs/cella/issues/848)) ([ae1bfa3](https://github.com/cellajs/cella/commit/ae1bfa30b83868fa33bea34b7d7548733faa48f7))

### 🐞 Bug fixes

- type in yjs Dockerfile ([#843](https://github.com/cellajs/cella/issues/843)) ([f637c3e](https://github.com/cellajs/cella/commit/f637c3e1412b2e7077896951dc1f9adf3e53dbd6))

### 🔧 Small improvements

- infra audit ([#846](https://github.com/cellajs/cella/issues/846)) ([e8b85a0](https://github.com/cellajs/cella/commit/e8b85a0de59b8b42f631380366a9bb1ae45098bf))

## [0.2.1](https://github.com/cellajs/cella/compare/0.2.0...0.2.1) (2026-07-04)

### 🐞 Bug fixes

- otel versioning mismatch ([#841](https://github.com/cellajs/cella/issues/841)) ([79ca53f](https://github.com/cellajs/cella/commit/79ca53f98875e55fa3c4cd95d95b4d868022efd1))

## [0.2.0](https://github.com/cellajs/cella/compare/0.1.1...0.2.0) (2026-07-04)

### ⚠ BREAKING CHANGES

- cella cli moved to an npm package ([#840](https://github.com/cellajs/cella/issues/840))

### 🎉 New features

- cella cli more informative during analyze ([#839](https://github.com/cellajs/cella/issues/839)) ([f8d4cd3](https://github.com/cellajs/cella/commit/f8d4cd34b78773416d4d270b6e42f5fc4d50d842))
- cella cli moved to an npm package ([#840](https://github.com/cellajs/cella/issues/840)) ([8614d6a](https://github.com/cellajs/cella/commit/8614d6a42a40e89ec86778d2c208c5280686491e))
- cella cli sync rerun ([#836](https://github.com/cellajs/cella/issues/836)) ([b3bb81d](https://github.com/cellajs/cella/commit/b3bb81dc31aef45a732ede7f13e2a9eb22f82b1c))
- cli should make sure main is up to date before syncing ([16e45c1](https://github.com/cellajs/cella/commit/16e45c1365faf597f4904d065783719bc325ee5a))
- **cli:** add release workflow ([#835](https://github.com/cellajs/cella/issues/835)) ([7ab5dff](https://github.com/cellajs/cella/commit/7ab5dff67ad0bb8f7bb3a368a43361e1996b0dc0))
- dont show analyze/sync in cella itself ([380bd41](https://github.com/cellajs/cella/commit/380bd419b1e9148c78ddd2c7599fdf5c521dd39d))
- idempotent cella cli sync ([0d774ea](https://github.com/cellajs/cella/commit/0d774ea3797a6e14ab5adf8ee7ac5964d314e3e0))
- **infra:** wire appConfig.singleVM into the deploy layer ([#833](https://github.com/cellajs/cella/issues/833)) ([267c698](https://github.com/cellajs/cella/commit/267c698e42e698bf988e63276a6cb97057c53703))
- restage on resume cella sync ([#838](https://github.com/cellajs/cella/issues/838)) ([80e2a86](https://github.com/cellajs/cella/commit/80e2a86880dc395c192b365f376abd88aca718e5))
- simplify db maintenance logic ([c5a1970](https://github.com/cellajs/cella/commit/c5a1970dca2d94dcd75b274ac8f6b9fc26f0c6b0))

### 🐞 Bug fixes

- cella sync should trust manifest.json ([204dd2a](https://github.com/cellajs/cella/commit/204dd2aaee196aec030cbd0a3d09b7f99505b48e))
- properly clean up test-db-config ([#834](https://github.com/cellajs/cella/issues/834)) ([5d3edbc](https://github.com/cellajs/cella/commit/5d3edbc00843471ef39f2403ad8faaf63eec5c18))

## [0.1.1](https://github.com/cellajs/cella/compare/0.1.0...0.1.1) (2026-07-01)

### 🐞 Bug fixes

- ci and create-cella fixes ([#830](https://github.com/cellajs/cella/issues/830)) ([5cd1dbd](https://github.com/cellajs/cella/commit/5cd1dbd4859972e0cec0cb68fc501f05a8e8d280))
- **ci:** resolve scaffold dir via $RUNNER_TEMP in template-drift ([#829](https://github.com/cellajs/cella/issues/829)) ([5e1ec97](https://github.com/cellajs/cella/commit/5e1ec9793677a425b838ae87035680c126c5cf7a))

## [0.1.0](https://github.com/cellajs/cella/compare/0.0.2...0.1.0) (2026-07-01)

### ⚠ BREAKING CHANGES

- **create-cella:** drop auto-install and shell access ([#821](https://github.com/cellajs/cella/issues/821))

### 🎉 New features

- **create-cella:** drop auto-install and shell access ([#821](https://github.com/cellajs/cella/issues/821)) ([3b3bdb6](https://github.com/cellajs/cella/commit/3b3bdb61a57a8d6a7a4dfd08aa1b314630eec1e4))

### 🐞 Bug fixes

- allow production deploy from release tag ref ([#812](https://github.com/cellajs/cella/issues/812)) ([169883b](https://github.com/cellajs/cella/commit/169883b1742ac3dde6f84ff7532a6bf5a78841cd))
- pin protobufjs to patched 8.x to clear high-severity audit advisories ([#814](https://github.com/cellajs/cella/issues/814)) ([f3aa942](https://github.com/cellajs/cella/commit/f3aa9424116f80ffdb955b7b650c2992b718d79f))

### 🔧 Small improvements

- cli sync config simplification ([#825](https://github.com/cellajs/cella/issues/825)) ([73be0e0](https://github.com/cellajs/cella/commit/73be0e0e62a2a239b74a23eaef36117e32f1a3ba))
- **create-cella:** replace git binary with isomorphic-git ([#820](https://github.com/cellajs/cella/issues/820)) ([12ce6dc](https://github.com/cellajs/cella/commit/12ce6dc0b4ba2a46b3bbfd5ac53731b24a016b1e))

### 📖 Documentation

- align create-cella docs with no-shell scaffolding ([#822](https://github.com/cellajs/cella/issues/822)) ([f1117be](https://github.com/cellajs/cella/commit/f1117bead5b9ecd0af5516c72225900cc8cd72e5))

## [0.0.2](https://github.com/cellajs/cella/compare/0.0.1...0.0.2) (2026-06-30)

### 🎉 New features

- prepare cella for release ([41ba9dc](https://github.com/cellajs/cella/commit/41ba9dc7da9c90d8b3aeea9966873e4f486e113a))
- prune deployments in gh action finale ([#810](https://github.com/cellajs/cella/issues/810)) ([721143b](https://github.com/cellajs/cella/commit/721143bde659569786b57ba0d113956b4b56b0d5))
- unified idb instance per user for local app cache ([671edbf](https://github.com/cellajs/cella/commit/671edbf1a875beb3b282d03b9fdf028f3439efc5))

### 🐞 Bug fixes

- **create-cella:** singleVM missing from default config placeholder ([6f5e680](https://github.com/cellajs/cella/commit/6f5e6809d3c8ab34c6ff0b52c020854e5a4fe3e5))
- deploy failed due to symlinks, improve diagnosis ([447c5b2](https://github.com/cellajs/cella/commit/447c5b2f8a1603ae8c00b9bd6f97d2bc61966f15))
- dockerfile needs to include cdc and yjs to pass when singleVM is true, removed no-op dockerignore ([fec9ab4](https://github.com/cellajs/cella/commit/fec9ab406d440ff7fa66b66ed99ece1d06ab7557))
- get rid of pnpm catalog mess ([bc69a3c](https://github.com/cellajs/cella/commit/bc69a3c6ed7c726e12b76fda32cd712514ebba7c))
