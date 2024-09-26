#!/usr/bin/env node

import { basename, resolve } from 'node:path'
import { existsSync } from 'node:fs'

import { input, confirm, select } from '@inquirer/prompts';
import { cli } from './cli.js'
import { validateProjectName } from './utils/validate-project-name.js'
import { isEmptyDirectory } from './utils/is-empty-directory.js'
import { create } from './create.js'
import { CELLA_TITLE } from './constants.js'

async function main() {
  console.log(CELLA_TITLE);

  // Skip creating a new branch (just work from main)
  if (cli.options.skipNewBranch === true) {
    cli.createNewBranch = false
    cli.newBranchName = null
  }

  // Skip installing packages
  if (cli.options.skipInstall === true) {
    cli.options.skipInstall = true
  }

  // Skip clean cella template
  if (cli.options.skipClean === true) {
    cli.options.skipClean = true
  }

  // Skip setting initialize git
  if (cli.options.skipGit === true) {
    cli.options.skipGit = true
    cli.createNewBranch = false
    cli.newBranchName = null
  }

  // Project name
  if (!cli.directory) {
    cli.directory = await input({
      message: 'Enter the project name',
      default: 'my-cella-app',
      validate: (name) => {
        const validation = validateProjectName(basename(resolve(name)))
        if (validation.valid) {
          return true
        }
        return 'Invalid project name: ' + validation.problems[0]
      },
    })
  }

  // Ask to create a new branche besides `main`
  if (cli.createNewBranch === null) {
    cli.createNewBranch = await confirm({
      message: 'Do you want to create a new branch besides the main one?',
      default: true,
    })
  }

  // New branche name, will be skipped if you don't want to create a new branch
  if (!cli.newBranchName && cli.createNewBranch) {
    cli.newBranchName = await input({
      message: 'Enter the name of the new branch',
      default: 'development',
      validate: (name) => {
        const validation = validateProjectName(basename(resolve(name)))
        if (validation.valid) {
          return true
        }
        return 'Invalid branche name: ' + validation.problems[0]
      },
    })
  }

  const targetFolder = resolve(cli.directory)
  const projectName = basename(targetFolder)

  if (existsSync(targetFolder) && !(await isEmptyDirectory(targetFolder))) {
    const dir =
      cli.directory === '.'
        ? 'Current directory'
        : `Target directory "${targetFolder}"`
    const message = `${dir} is not empty. Please choose how to proceed:`
    const action = await select({
      message,
      choices: [
        { name: 'Cancel', value: 'cancel' },
        { name: 'Ignore files and continue', value: 'ignore' },
      ],
    })
    if (action === 'cancel') {
      process.exit(1)
    }
  }
  
  await create({
    projectName,
    targetFolder,
    newBranchName: cli.newBranchName,
    skipInstall: cli.options.skipInstall,
    skipGit: cli.options.skipGit,
    skipClean: cli.options.skipClean,
    packageManager: cli.packageManager,
  });
}

main().catch(console.error)