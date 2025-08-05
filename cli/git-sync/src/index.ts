import pc from "picocolors";
import yoctoSpinner from 'yocto-spinner';
import { boilerplateConfig, forkConfig } from "./config";
import { getFilesWithHashed } from "./get-files-with-hashed";
import { createFileAnalyses } from './file-analysis';

const glyphs = {
  upToDate: pc.green('✔'),        // check mark
  missing: pc.red('✗'),           // cross mark
  ahead: pc.green('⇧'),           // up arrow
  behind: pc.yellow('⇩'),         // down arrow
  diverged: pc.magenta('⇔'),      // left-right arrow
  unrelated: pc.gray('⊗'),         // circled times
  outdated: pc.yellow('…'),       // ellipsis
  ignored: pc.dim('⧉'),          // dimmed symbol for ignored files
};

async function main(): Promise<void> {
  console.log(pc.cyan("🔄 Starting git-sync..."));

  const spinner = yoctoSpinner({ text: "Fetching repo file list..." });
  spinner.start();

  const [boilerplateFiles, forkFiles] = await Promise.all([
    getFilesWithHashed(boilerplateConfig),
    getFilesWithHashed(forkConfig),
  ]);

  spinner.stop();

  spinner.start("Analyzing file histories...");

  const fileAnalyses = await createFileAnalyses(
    boilerplateConfig,
    forkConfig,
    boilerplateFiles,
    forkFiles
  );

  spinner.stop();

  console.log(pc.bold("\n📁 File Sync Status:\n"));

  const summary = {
    upToDate: 0,
    missing: 0,
    ahead: 0,
    behind: 0,
    diverged: 0,
    unrelated: 0,
    outdated: 0,

    expectedConflicts: 0,
    expectedAutoResolvableConflicts: 0,
    ignored: 0,
  };

  for (const file of fileAnalyses) {
    const { expectation } = file;
    const { type, expectingConflict, canAutoResolve, ignored } = expectation;

    if (type in summary) summary[type]++;

    if (expectingConflict && !ignored) {
      summary.expectedConflicts++;
      if (canAutoResolve) {
        summary.expectedAutoResolvableConflicts++;
      }
    }

    if (ignored) {
      summary.ignored++;
    }
  }

  for (const file of fileAnalyses) {
    const isIgnored = file.expectation.ignored;

    const relPath = isIgnored ? pc.dim(file.path) : pc.white(file.path);
    const boilerSha = isIgnored ? pc.gray(file.boilerplateFile.shortBlobSha) : pc.green(file.boilerplateFile.shortBlobSha);
    const forkSha = file.forkedFile ? isIgnored ? pc.gray(file.forkedFile.shortCommitSha) : pc.red(file.forkedFile.shortCommitSha) : '';
    const inSyncDate = file.comparison?.lastInSyncDate
      ? ` (last in sync: ${pc.gray(new Date(file.comparison.lastInSyncDate).toLocaleDateString())})`
      : '';

    const showsConflict = file.expectation.expectingConflict;
    const canAutoResolve = file.expectation.canAutoResolve && !isIgnored;
    const resolution = file.expectation.resolutionStrategy || 'keepBoilerplate';

    const autoResolveTag = showsConflict && canAutoResolve
      ? `${pc.bgGreen(pc.black(' Auto '))} ${pc.green(`→ ${resolution}`)}`
      : '';

    const conflictTag = showsConflict
      ? `${isIgnored ? pc.red(' Conflict ') : pc.bgRed(pc.black(' Conflict '))}`
      : '';

    const ignoredTag = isIgnored ? pc.dim('[ignored]') : '';
    const ignoredIcon = isIgnored ? glyphs.ignored : '';

    switch (file.expectation.type) {
      case 'missing':
        console.log(`${glyphs.missing} ${relPath} is missing`);
        break;

      case 'upToDate':
        // silent, or log if needed
        break;

      case 'ahead':
        console.log(
          `${ignoredIcon || glyphs.ahead} ${relPath} ${pc.gray('fork is ahead by')} (↑ ${pc.yellow(file.comparison?.aheadCount)}) (${forkSha} → ${boilerSha})${inSyncDate} ${ignoredTag}`
        );
        break;

      case 'behind':
        console.log(
          `${ignoredIcon || glyphs.behind} ${relPath} ${pc.gray('is behind by')} (↓ ${pc.yellow(file.comparison?.behindCount)}) (${forkSha} → ${boilerSha})${inSyncDate} ${ignoredTag}`
        );
        break;

      case 'diverged':
        console.log(
          `${ignoredIcon || glyphs.diverged} ${relPath} ${pc.gray('has diverged')} (↑ ${pc.yellow(file.comparison?.aheadCount)}, ↓ ${pc.yellow(file.comparison?.behindCount)}) (${forkSha} ≠ ${boilerSha})${inSyncDate} ${conflictTag} ${autoResolveTag} ${ignoredTag}`
        );
        break;

      case 'unrelated':
        console.log(
          `${ignoredIcon || glyphs.unrelated} ${relPath} ${pc.gray('has unrelated history')} (${forkSha} → ${boilerSha}) ${conflictTag} ${autoResolveTag} ${ignoredTag}`
        );
        break;

      case 'outdated':
        console.log(
          `${ignoredIcon || glyphs.outdated} ${relPath} ${pc.gray('is outdated')} (${forkSha} → ${boilerSha}) ${conflictTag} ${autoResolveTag} ${ignoredTag}`
        );
        break;
    }
  }

  // 📊 Final summary
  console.log(pc.bold(`\n📊 Summary:`));
  console.log(`  ${glyphs.upToDate} Up to date:    ${pc.green(summary.upToDate)} Files`);
  console.log(`  ${glyphs.missing} Missing:       ${pc.red(summary.missing)} Files`);
  console.log(`  ${glyphs.ahead} Ahead:         ${pc.green(summary.ahead)} Files`);
  console.log(`  ${glyphs.behind} Behind:        ${pc.yellow(summary.behind)} Files`);
  console.log(`  ${glyphs.diverged} Diverged:      ${pc.magenta(summary.diverged)} Files`);
  console.log(`  ${glyphs.unrelated} Unrelated:     ${pc.gray(summary.unrelated)} Files`);
  console.log(`  ${glyphs.outdated} Outdated:      ${pc.yellow(summary.outdated)} Files`);

  console.log(pc.bold(`\n🔍 Merge Conflict Overview:`));
console.log(`  ✖ Expected Conflicts:         ${pc.red(summary.expectedConflicts)} Files`);
console.log(`  ✔ Auto-Resolvable Conflicts:  ${pc.cyan(summary.expectedAutoResolvableConflicts)} Files`);
console.log(`  ⤫ Ignored Files:              ${pc.gray(summary.ignored)} Files`);
}

main().catch((err) => {
  console.error(pc.red("❌ Error:"), err.message);
});