import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path';
import colors from 'picocolors';
import { downloadTemplate } from "giget";
import yoctoSpinner from 'yocto-spinner';

import { TEMPLATE_URL } from './constants.js';

import { install, generate } from './utils/run-package-manager-command.js';
import { cleanTemplate } from './utils/clean-template.js';
import { runGitCommand } from './utils/run-git-command.js';

export async function create({
    projectName,
    targetFolder,
    newBranchName,
    skipInstall,
    skipGit,
    skipClean,
    skipGenerate,
    packageManager,
  }) {
    // Save the original working directory
    const originalCwd = process.cwd();

    console.info();
    
    // Create the target folder if it doesn't exist
    const createFolderSpinner = yoctoSpinner({
        text: 'Creating project folder',
    }).start();

    await mkdir(targetFolder, { recursive: true });
    process.chdir(targetFolder);

    createFolderSpinner.success('Project folder created');

    // Download the template from the specified URL
    const downloadSpinner = yoctoSpinner({
      text: 'Downloading `cella` template',
    }).start();

    await downloadTemplate(TEMPLATE_URL, {
        cwd: process.cwd(),
        dir: targetFolder,
        force: true,
        provider: "github",
    });

    downloadSpinner.success('`cella` template downloaded');

    // Clean the template if the skipClean flag is not set
    if (!skipClean) {
      const cleanSpinner = yoctoSpinner({
        text: 'cleaning `cella` template',
      }).start();

      try {
        await cleanTemplate({ 
          targetFolder,
          projectName,
        })
        cleanSpinner.success('`cella` template cleaned')
      } catch (e) {
        console.error(e);
        cleanSpinner.error('Failed to clean `cella` template');
        process.exit(1);
      }
    } else {
      console.info(`${colors.yellow('⚠')} --skip-clean > Skip cleaning \`cella\` template'`)
    }

    // Install dependencies if the skipInstall flag is not set
    if (!skipInstall) {
      const installSpinner = yoctoSpinner({
        text: 'installing dependencies',
      }).start();

      try {
        await install(packageManager)
        installSpinner.success('Dependencies installed');
      } catch (e) {
        console.error(e);
        installSpinner.error('Failed to install dependencies');
        process.exit(1);
      }
    } else {
      console.info(`${colors.yellow('⚠')} --skip-install > Skip installing dependencies`)
    }

    // Generate SQL files if the skipGenerate flag is not set
    if (!skipGenerate) {
      const installSpinner = yoctoSpinner({
        text: 'generating SQL files',
      }).start();

      try {
        await generate(packageManager)
        installSpinner.success('SQL files generated');
      } catch (e) {
        console.error(e);
        installSpinner.error('Failed to generate SQL files');
        process.exit(1);
      }
    } else {
      console.info(`${colors.yellow('⚠')} --skip-generate > Skip generating SQL files`)
    }

    // Initialize Git repository if skipGit flag is not set
    if (!skipGit) {
      const gitSpinner = yoctoSpinner({
        text: 'initializing git repository',
      }).start();

      const gitFolderPath = join(targetFolder, '.git');

      if (!existsSync(gitFolderPath)) {
        try {
          // Run Git commands to initialize the repository and make the first commit
          await runGitCommand({ targetFolder, command: 'init' });
          await runGitCommand({ targetFolder, command: 'add .' });
          await runGitCommand({ targetFolder, command: 'commit -m "Initial commit"' });
        
          // If a new branch name is specified, create and checkout the branch
          if (newBranchName) {
            await runGitCommand({ targetFolder, command: `branch ${newBranchName}` });
            await runGitCommand({ targetFolder, command: `checkout ${newBranchName}` });
            gitSpinner.success(`Git repository initialized, initial commit created, and new branch ${newBranchName} created`);
          } else {
            gitSpinner.success('Git repository initialized and initial commit created');
          }
        
        } catch (e) {
          console.error(e);
          gitSpinner.error('Failed to initialize Git repository or create branch');
          process.exit(1);
        }
      } else {
        gitSpinner.warning('Git repository already initialized > Skip git init')
      }
    } else {
      console.info(`${colors.yellow('⚠')} --skip-git > Skip git init`)
    }
    
    // Final success message indicating project creation
    console.info()
    console.info(`${colors.green('Success')} Created ${projectName} at ${targetFolder}`)
    console.info()

    // Check if the working directory needs to be changed
    const needsCd = originalCwd !== targetFolder;
    if (needsCd) {
      // Calculate the relative path between the original working directory and the target folder
      const relativePath = relative(originalCwd, targetFolder);

      console.info('now go to your project using:')
      console.info(colors.cyan(`  cd ./${relativePath}`)); // Adding './' to make it clear it's a relative path
      console.info()
    }
    console.info(`${needsCd ? 'then ' : ''}quick start with:`)
    console.info(colors.cyan(`  ${packageManager} quick`))
    console.info()

    console.info('Read the readme in project root for more info on how to get started!')
    console.info(`Enjoy building ${projectName} using cella! 🎉`)
  }