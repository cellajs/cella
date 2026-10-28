import { readFileSync } from 'node:fs';

/** Types release-please knows (`.github/release-please-config.json` maps them to changelog sections). */
const commitTypes = ['feat', 'fix', 'perf', 'refactor', 'revert', 'docs', 'chore', 'build', 'ci', 'style', 'test'];

const maxHeaderLength = 120;

/** `type(scope)!: subject`, as release-please parses it. */
const headerPattern = /^(\w*)(?:\((.*)\))?!?: (.*)$/;

/** Headers of the messages git or a tool writes. */
const generatedPatterns = [
  /^((Merge pull request)|(Merge (.*?) into (.*?)|(Merge branch (.*?)))$)/,
  /^(Merge tag (.*?))$/,
  /^(R|r)evert (.*)/,
  /^(R|r)eapply (.*)/,
  /^(amend|fixup|squash)!/,
  /^(Merged (.*?)(in|into) (.*)|Merged PR (.*): (.*))/,
  /^Merge remote-tracking branch(\s*)(.*)/,
  /^Automatic merge(.*)/,
  /^Auto-merged (.*?) into (.*)/,
  /^(chore(\([^)]+\))?:)?\s*v?\d+\.\d+\.\d+(-[\w.]+)?\s*$/,
];

/** The message as git will store it: no comment lines, nothing below the `--verbose` scissors line, no leading blank lines. */
function storedMessage(raw: string): string {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const scissors = lines.findIndex((line) => /^# -+ >8 -+$/.test(line));
  const kept = (scissors === -1 ? lines : lines.slice(0, scissors)).filter((line) => !line.startsWith('#'));
  return kept.join('\n').replace(/^(\s*\n)+/, '');
}

/** What is wrong with a commit message, one line per rule it breaks; empty when it passes. */
export function commitMessageErrors(raw: string): string[] {
  const header = storedMessage(raw).split('\n')[0];
  if (generatedPatterns.some((pattern) => pattern.test(header))) return [];

  const errors: string[] = [];
  if (header.length > maxHeaderLength) errors.push(`header is ${header.length} characters, at most ${maxHeaderLength}`);
  if (header !== header.trim()) errors.push('header must not start or end with whitespace');

  const match = headerPattern.exec(header.trim());
  if (!match?.[1] || !match[3].trim()) {
    errors.push('header must read `type(scope): subject`, scope optional, `!` before the colon for a breaking change');
    return errors;
  }
  const [, type, , subject] = match;
  if (!commitTypes.includes(type)) errors.push(`type "${type}" must be one of ${commitTypes.join(', ')}`);
  if (/^[\p{Lu}\p{Lt}]/u.test(subject)) errors.push('subject must not start with a capital letter');
  if (header.endsWith('.') && !header.endsWith('...')) errors.push('subject must not end with a full stop');
  return errors;
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node shared/scripts/check-commit-msg.ts <commit message file>');
    process.exit(2);
  }
  const errors = commitMessageErrors(readFileSync(file, 'utf8'));
  for (const error of errors) console.error(`✖ ${error}`);
  if (errors.length) {
    console.error('Conventional Commits: https://www.conventionalcommits.org');
    process.exit(1);
  }
}
