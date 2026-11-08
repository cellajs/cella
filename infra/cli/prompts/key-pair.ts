import { createPrompt, isEnterKey, makeTheme, type Status, useKeypress, usePrefix, useState } from '@inquirer/core';
import type { KeyPair } from '../../lib/scaleway/operator-identity';
import { pc } from '../../lib/utils/cli-output';
import { maskedSecret } from './masked-secret';

/** An access key as Scaleway issues them: `SCW` and 17 capitals or digits. The example is the placeholder of the prompt. */
export const ACCESS_KEY_EXAMPLE = 'SCW10X9PSSZ7B106DZNY';
const ACCESS_KEY = /^SCW[A-Z0-9]{17}$/;
const SECRET_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Why a value is no access key, or undefined when it has the form of one. */
export function accessKeyFault(value: string): string | undefined {
  if (value.length === 0) return 'Paste the access key.';
  if (!value.startsWith('SCW')) return `An access key starts with SCW, as ${ACCESS_KEY_EXAMPLE} does.`;
  if (value.length !== ACCESS_KEY_EXAMPLE.length) return `An access key has ${ACCESS_KEY_EXAMPLE.length} characters, this one ${value.length}.`;
  if (!ACCESS_KEY.test(value)) return 'An access key holds capitals and digits only.';
  return undefined;
}

/** Why a value is no secret key, or undefined when it has the form of one: a UUID. */
export function secretKeyFault(value: string): string | undefined {
  if (value.length === 0) return 'Paste the secret key.';
  if (!SECRET_KEY.test(value))
    return `A secret key is a UUID of 36 characters (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), this value has ${value.length}.`;
  return undefined;
}

/** What the prompt shows after the value while it is typed: how far a key is, or the check mark once it has the form of one. */
export function accessKeyProgress(value: string): string {
  if (value.length === 0) return '';
  return accessKeyFault(value) ? `${value.length} of ${ACCESS_KEY_EXAMPLE.length}` : '✔';
}

interface AccessKeyConfig {
  message: string;
  /** What an empty answer means, when one is allowed: shown dim after the placeholder. */
  optional?: string;
}

/**
 * The access key prompt: the example key as placeholder while nothing is typed, the count of characters while a key is typed, and a check
 * mark once it has the form of one. Enter with another form says what is wrong and keeps the value; Enter on nothing resolves to '' when
 * the prompt is optional.
 */
export const accessKeyPrompt = createPrompt<string, AccessKeyConfig>((config, done) => {
  const theme = makeTheme();
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setError] = useState<string>();
  const [value, setValue] = useState('');
  const prefix = usePrefix({ status, theme });

  useKeypress((key, rl) => {
    if (status !== 'idle') return;
    if (isEnterKey(key)) {
      const trimmed = value.trim();
      if (trimmed === '' && config.optional) {
        setStatus('done');
        done('');
        return;
      }
      const fault = accessKeyFault(trimmed);
      if (fault) {
        rl.write(value);
        setError(fault);
        return;
      }
      setStatus('done');
      done(trimmed);
    } else {
      setValue(rl.line);
      setError(undefined);
    }
  });

  const message = theme.style.message(config.message, status);
  if (status === 'done') return `${prefix} ${message} ${theme.style.answer(value.trim())}`;
  const shown = value.length > 0 ? value : pc.dim(ACCESS_KEY_EXAMPLE) + (config.optional ? ` ${pc.dim(`(${config.optional})`)}` : '');
  const progress = accessKeyProgress(value.trim());
  const line = `${prefix} ${message} ${shown}${progress ? ` ${progress === '✔' ? pc.green(progress) : pc.dim(progress)}` : ''}`;
  return [line, errorMsg ? theme.style.error(errorMsg) : ''];
});

export interface KeyPairPromptOptions {
  /** The key's name in both prompts: `Operator key`, `Owner key`. */
  label: string;
  /** Where the key comes from, printed once above the prompts. */
  howto: string;
  /** The console page that makes it. */
  url?: string;
  /** What an empty access key means, when one is allowed; the prompt then resolves to undefined on it. */
  optional?: string;
}

/**
 * Both halves of a Scaleway key: the where-to line, the access key with its placeholder and form check, then the secret key masked with
 * its own form check. Undefined when the prompt is optional and left empty.
 */
export async function keyPairPrompt(opts: KeyPairPromptOptions): Promise<KeyPair | undefined> {
  console.info(`\n  ${pc.dim(opts.howto)}${opts.url ? `\n  ${pc.dim('Console:')} ${pc.underline(opts.url)}` : ''}\n`);
  const accessKey = await accessKeyPrompt({ message: opts.label, optional: opts.optional });
  if (!accessKey) return undefined;
  const secretKey = (await maskedSecret({ message: `${opts.label}, secret`, validate: (value) => secretKeyFault(value.trim()) ?? true })).trim();
  return { accessKey, secretKey };
}
