// The hash of this checkout's description of the app for one environment, printed alone on stdout: what an apply records, the engine
// image's build checks and a builder reports from the target's checkout, keyless. APP_MODE is set before the config loads, as deploy.ts does.
const argv = process.argv.slice(2);
const modeIndex = argv.indexOf('--mode');
const mode = modeIndex >= 0 ? argv[modeIndex + 1] : process.env.APP_MODE;
if (!mode) {
  console.error('Usage: description-hash.ts --mode <staging|production> (or APP_MODE)');
  process.exit(1);
}
process.env.APP_MODE = mode;

const { loadEngineConfig } = await import('../config/engine-config');
await loadEngineConfig();
const { appDescriptionHash } = await import('../lib/deploy/app-description');
process.stdout.write(`${await appDescriptionHash()}\n`);

export {};
