import { spawn } from 'node:child_process'

export interface ExecResult {
  code: number
  stdout: string
  stderr: string
}

export type ExecFn = (command: string, args: string[], opts?: { cwd?: string; input?: string }) => Promise<ExecResult>

export const execCommand: ExecFn = (command, args, opts = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf-8')
  child.stderr.setEncoding('utf-8')
  child.stdout.on('data', (chunk) => void (stdout += chunk))
  child.stderr.on('data', (chunk) => void (stderr += chunk))
  child.on('error', reject)
  child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  if (opts.input) child.stdin.end(opts.input)
  else child.stdin.end()
})

export async function mustExec(exec: ExecFn, command: string, args: string[], opts?: { cwd?: string; input?: string }): Promise<ExecResult> {
  const result = await exec(command, args, opts)
  if (result.code !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit ${result.code}: ${result.stderr || result.stdout}`)
  return result
}
