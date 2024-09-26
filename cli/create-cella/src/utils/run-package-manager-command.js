import spawn from 'cross-spawn'

export async function runPackageManagerCommand(
  packageManager,
  args,
  env = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(packageManager, args, {
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stderrBuffer = ''
    let stdoutBuffer = ''

    child.stderr?.on('data', (data) => {
      stderrBuffer += data
    })

    child.stdout?.on('data', (data) => {
      stdoutBuffer += data
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          `"${packageManager} ${args.join(' ')}" failed ${stdoutBuffer} ${stderrBuffer}`,
        )
        return
      }
      resolve()
    })
  })
}

export async function install(packageManager) {
  return runPackageManagerCommand(packageManager, ['install'], {
    NODE_ENV: 'development',
  })
}