import { runGenerateScripts } from './migrations/helpers/run-generate-scripts';
import { generateScripts } from './scripts-discovery';

runGenerateScripts(generateScripts).catch((err) => {
  console.error('Generation failed:', err.message);
  process.exit(1);
});
