import { createPrompt, isEnterKey, makeTheme, type Status, useKeypress, usePrefix, useState } from '@inquirer/core';

/**
 * Render a secret as one mask character per character, and nothing of the value. The prompt redraws at every keystroke, so a character shown
 * at the end of a value being typed is shown for every position in turn: whatever records the terminal's output (a session log, a recorder,
 * a CI log, an agent's transcript) would then hold the whole secret.
 */
export function maskSecret(value: string): string {
  return '•'.repeat(value.length);
}

interface MaskedSecretConfig {
  message: string;
  /** Mirrors `@inquirer/prompts`' password validate so this is a drop-in replacement. */
  validate?: (value: string) => boolean | string | Promise<boolean | string>;
}

/**
 * A password-style prompt that shows a mask and the length of what was typed or pasted: the length catches a wrong paste before it is stored,
 * and no character of the value reaches the terminal, its scrollback, or anything that records its output.
 * Drop-in replacement for `@inquirer/prompts`' `password`: same `{ message, validate? }` config and `Promise<string>` result.
 */
export const maskedSecret = createPrompt<string, MaskedSecretConfig>((config, done) => {
  const { validate = () => true } = config;
  const theme = makeTheme();
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setError] = useState<string>();
  const [value, setValue] = useState('');
  const prefix = usePrefix({ status, theme });

  useKeypress(async (key, rl) => {
    if (status !== 'idle') return;

    if (isEnterKey(key)) {
      setStatus('loading');
      const isValid = await validate(value);
      if (isValid === true) {
        setStatus('done');
        done(value);
      } else {
        // Restore the line so the operator can fix the value in place after the line event clears it.
        rl.write(value);
        setError(typeof isValid === 'string' ? isValid : 'You must provide a valid value');
        setStatus('idle');
      }
    } else {
      setValue(rl.line);
      setError(undefined);
    }
  });

  const message = theme.style.message(config.message, status);
  const masked = maskSecret(value);
  const display = status === 'done' ? theme.style.answer(masked) : masked;
  const counter = status === 'idle' && value.length > 0 ? ` ${theme.style.help(`(${value.length} chars)`)}` : '';
  const error = errorMsg ? theme.style.error(errorMsg) : '';

  return [`${prefix} ${message} ${display}${counter}`.trimEnd(), error];
});
