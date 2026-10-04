import { isOperatorActionId, type OperatorActionId } from '../lib/operator-actions';

/** What the command line of `pnpm infra` asks for. */
export interface CliArgs {
  /** The action to run without the menu: `pnpm infra <action>`. */
  action?: OperatorActionId;
  /** A first word that names no action; the CLI lists the ones that exist. */
  unknownAction?: string;
  /** `--mode <production|staging>`; validated where the mode is resolved. */
  mode?: string;
  /** `--once`: leave after the first action chosen in the menu. */
  once: boolean;
  /** `help`, `--help` or `-h`: print the commands and leave. */
  help: boolean;
}

/** Flags that take the next word as their value, so that word is never read as the action. */
const VALUE_FLAGS = new Set(['--mode']);

/**
 * Read the command line (everything after the script). The first word that is no flag and no flag value names the action. Flags the
 * actions read on their own (`--defaults`, `--debug-provider`) pass through untouched.
 */
export function parseCliArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { once: false, help: false };
  let word: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index] ?? '';
    if (VALUE_FLAGS.has(token)) {
      if (token === '--mode') args.mode = argv[index + 1];
      index++;
    } else if (token === '--once') args.once = true;
    else if (token === '--help' || token === '-h') args.help = true;
    else if (!token.startsWith('-') && word === undefined) word = token;
  }
  if (word === 'help') args.help = true;
  else if (word !== undefined && isOperatorActionId(word)) args.action = word;
  else if (word !== undefined) args.unknownAction = word;
  return args;
}
