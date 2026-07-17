import { generateSideEffects } from './migrations/helpers/combine-side-effects';
import { runDrizzleGenerate } from './migrations/helpers/run-drizzle-generate';
import { sideEffectProducers } from './scripts-discovery';

/**
 * `pnpm generate` runs in two phases:
 *   1. drizzle-kit generate creates the schema-diff migration folder.
 *   2. The side-effect collector creates one combined folder for raw SQL that Drizzle Kit
 *      cannot express (RLS grants, triggers, functions, publications, partitioning, …).
 *
 * The collector runs second so its folder sorts (and applies) after the schema changes.
 */
async function generate(): Promise<void> {
  await runDrizzleGenerate();
  await generateSideEffects(sideEffectProducers);
}

generate().catch((err) => {
  console.error('Generation failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
