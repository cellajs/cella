import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path';
import colors from 'picocolors';
import { downloadTemplate } from "giget";
import yoctoSpinner from 'yocto-spinner';

import { TEMPLATE_URL} from './constants.js';

import { install } from './utils/run-package-manager-command.js';
import { cleanTemplate } from './utils/clean-template.js';
import { runGitCommand } from './utils/run-git-command.js';

export async function create({
    projectName,
    targetFolder,
    newBranchName,
    skipInstall,
    skipGit,
    skipClean,
    packageManager,
  }) {
    const originalCwd = process.cwd()

    console.log();
    
    const createFolderSpinner = yoctoSpinner({
        text: 'creating project folder',
    }).start();

    await mkdir(targetFolder, { recursive: true })
    process.chdir(targetFolder)

    createFolderSpinner.success('project folder created')

    const downloadSpinner = yoctoSpinner({
      text: 'Downloading `cella` template',
    }).start();

    await downloadTemplate(TEMPLATE_URL, {
        cwd: process.cwd(),
        dir: targetFolder,
        force: true,
        provider: "github",
    });
    downloadSpinner.success('`cella` template downloaded')

    if (!skipClean) {
      const cleanSpinner = yoctoSpinner({
        text: 'cleaning `cella` template',
      }).start()
      try {
        await cleanTemplate({ 
          targetFolder,
          projectName,
        })
        cleanSpinner.success('`cella` template cleaned')
      } catch (e) {
        console.error(e)
        cleanSpinner.error('failed to clean `cella` template')
        process.exit(1)
      }
    } else {
      console.log(`${colors.yellow('⚠')} --skip-clean > Skip cleaning \`cella\` template'`)
    }

    if (!skipInstall) {
      const installSpinner = yoctoSpinner({
        text: 'installing dependencies',
      }).start()
      try {
        await install(packageManager)
        installSpinner.success('dependencies installed')
      } catch (e) {
        console.error(e)
        installSpinner.error('failed to install dependencies')
        process.exit(1)
      }
    } else {
      console.log(`${colors.yellow('⚠')} --skip-install > Skip installing dependencies`)
    }

    if (!skipGit) {
      const gitSpinner = yoctoSpinner({
        text: 'initializing git repository',
      }).start()

      const gitFolderPath = join(targetFolder, '.git')

      if (!existsSync(gitFolderPath)) {
        try {
          await runGitCommand({ targetFolder, command: 'init' })
          await runGitCommand({ targetFolder, command: 'add .' })
          await runGitCommand({ targetFolder, command: 'commit -m "Initial commit"' })
        
          if (newBranchName) {
            await runGitCommand({ targetFolder, command: `branch ${newBranchName}` })
            await runGitCommand({ targetFolder, command: `checkout ${newBranchName}` })
            gitSpinner.success(`Git repository initialized, initial commit created and new branch ${newBranchName} created`)
          } else {
            gitSpinner.success('Git repository initialized and initial commit created')
          }
        
        } catch (e) {
          console.error(e)
          gitSpinner.error('Failed to initialize git repository or create branch')
          process.exit(1)
        }
      } else {
        gitSpinner.warning('Git repository already initialized > Skip git init')
      }
    } else {
      console.log(`${colors.yellow('⚠')} --skip-git > Skip git init`)
    }
    
    console.log()
    console.log(`${colors.green('Success')} Created ${projectName} at ${targetFolder}`)
    console.log()

    const needsCd = originalCwd !== targetFolder
    if (needsCd) {
      // Calculate the relative path between the original working directory and the target folder
      const relativePath = relative(originalCwd, targetFolder);

      console.log('now go to your project using:')
      console.log(colors.cyan(`  cd ./${relativePath}`)); // Adding './' to make it clear it's a relative path
      console.log()
    }
    console.log(`${needsCd ? 'then ' : ''}quick start with:`)
    console.log(colors.cyan(`  ${packageManager} quick`))
    console.log()

    console.log('Read the readme in project root for more info on how to get started!')
    console.log(`Enjoy building ${projectName} using cella! 🎉`)
  }