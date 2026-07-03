# Changelog

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
