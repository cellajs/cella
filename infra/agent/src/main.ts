import { pathToFileURL } from 'node:url'
import { boot } from './boot'
import { supportedSchemaVersion } from './plan'

export const agentVersion = '0.1.0-dev'

function usage(): never {
  throw new Error('Usage: cella-boot-agent --version | supports --schema-version <n> | boot --plan <path>')
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  if (argv[0] === '--version') {
    console.info(agentVersion)
    return 0
  }
  if (argv[0] === 'supports') {
    return Number(flag(argv, '--schema-version')) === supportedSchemaVersion ? 0 : 1
  }
  if (argv[0] === 'boot') {
    const planPath = flag(argv, '--plan')
    if (!planPath) usage()
    await boot({ planPath })
    return 0
  }
  usage()
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
