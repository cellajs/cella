# Changelog

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
* improve fork alignment ([#943](https://github.com/cellajs/cella/issues/943)) ([6f21e07](https://github.com/cellajs/cella/commit/6f21e0737de691963c31250ae7ea09ff543b239d))
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
- **permissions:** fork-safe hazard fixes + public-read migration tooling ([#885](https://github.com/cellajs/cella/issues/885)) ([88161b7](https://github.com/cellajs/cella/commit/88161b7b58c3ea6195e8f72a7ba01cace5fbc9b3))
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
- fork alignment ([ded27fb](https://github.com/cellajs/cella/commit/ded27fb10e183ab4696e5d9723b47b589d0f97f6))
- many improvements ([#862](https://github.com/cellajs/cella/issues/862)) ([6b1ca8f](https://github.com/cellajs/cella/commit/6b1ca8f33d7f6ab41e38ac022ec3bef7cc6ccd34))
- mdx consolidation ([#857](https://github.com/cellajs/cella/issues/857)) ([5e69279](https://github.com/cellajs/cella/commit/5e69279581d9e728e45ba57cd64eaf7df45fff2f))
- **permissions:** topology seam + wide-fixture kit for fork-independent engine tests ([#861](https://github.com/cellajs/cella/issues/861)) ([d4c3de6](https://github.com/cellajs/cella/commit/d4c3de6e857479ec67915f92b61167cada1e36aa))
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
