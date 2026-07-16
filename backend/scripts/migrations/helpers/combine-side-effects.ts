import pc from 'picocolors';
import { checkMark } from '#/utils/console';
import type { SideEffectBlock, SideEffectProducer } from '../../types';
import { logMigrationResult, upsertMigration } from './drizzle-utils';

/**
 * Single tag for the combined side-effect migration. Every producer's SQL lands in one folder
 * per generate run (created/evolved/unchanged handled by `upsertMigration`), instead of one
 * folder per producer. Keeps the `drizzle/` folder count flat as producers come and go.
 */
const SIDE_EFFECT_TAG = 'side_effects';

/** Render a section rule so each block is easy to locate in the combined `migration.sql`. */
function sectionRule(tag: string, title: string): string {
  const rule = `-- ${'═'.repeat(74)}`;
  return `${rule}\n-- [${tag}] ${title}\n${rule}`;
}

/**
 * Collect SQL from every side-effect producer and write it as ONE combined migration.
 *
 * The collector is generic over `producers`: it knows nothing about what any block does, so
 * adding or removing a producer never touches this file. Blocks are concatenated in the order
 * given (discovery = filename order) and separated by `--> statement-breakpoint` so the migrator
 * runs each as its own statement — identical boundaries to the previous one-folder-per-producer
 * layout, and applied in the same single transaction.
 *
 * Change detection is delegated to `upsertMigration`: identical combined SQL → no new folder;
 * any change → one fresh timestamped `*_side_effects` folder that re-runs the whole (idempotent)
 * set. Empty blocks are omitted so a fork that disabled a feature produces no dead SQL.
 */
export async function generateSideEffects(producers: SideEffectProducer[]): Promise<void> {
  console.info('');
  console.info(pc.bold(`Collecting side-effects from ${producers.length} producers...`));

  const blocks: SideEffectBlock[] = [];
  const seenTags = new Set<string>();

  for (const producer of producers) {
    const label = pc.cyan(`[${producer.name}]`);
    let block: SideEffectBlock;
    try {
      block = await producer.produce();
    } catch (err) {
      console.error(`${label} ${pc.red('Failed')}`);
      throw err;
    }

    if (!block.sql.trim()) {
      console.info(`${label} ${pc.dim('(no SQL — skipped)')}`);
      continue;
    }
    // Duplicate tags would silently merge two unrelated blocks under one section — fail loud.
    if (seenTags.has(block.tag)) throw new Error(`Duplicate side-effect tag: "${block.tag}"`);
    seenTags.add(block.tag);
    blocks.push(block);
    console.info(`${label} ${pc.dim(`→ ${block.tag}`)}`);
  }

  if (blocks.length === 0) {
    console.info(`${checkMark} No side-effects to generate.`);
    return;
  }

  const tagList = blocks.map((b) => b.tag).join(', ');
  const body = blocks
    .map((block) => `${sectionRule(block.tag, block.title)}\n${block.sql.trim()}`)
    .join('\n--> statement-breakpoint\n');

  const combinedSql = `-- Combined side-effect migration.
-- Blocks (in order): ${tagList}
-- Regenerate with \`pnpm generate\`. Every block is idempotent; the whole set re-runs
-- whenever ANY block changes, so this file always reflects the full current side-effect state.

${body}
`;

  const result = upsertMigration(SIDE_EFFECT_TAG, combinedSql);
  logMigrationResult(result, `side-effects: ${tagList}`);

  for (const block of blocks) {
    for (const note of block.notes ?? []) {
      console.info(`  ${pc.dim(`[${block.tag}]`)} ${note}`);
    }
  }
  console.info('');
}
