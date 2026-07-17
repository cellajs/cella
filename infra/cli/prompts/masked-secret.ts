import { createPrompt, isEnterKey, makeTheme, type Status, useKeypress, usePrefix, useState } from '@inquirer/core'

/**
 * Render a value with its first/last `revealEnds` characters visible and the
 * middle masked, so a *pasted* secret can be eyeballed for a wrong-clipboard
 * mistake without exposing the whole value. Anything too short to keep at least
 * as many characters hidden as revealed is fully masked.
 */
export function maskSecret(value: string, revealEnds: number): string {
  if (value.length === 0) return ''
  if (value.length < revealEnds * 3) return '•'.repeat(value.length)
  return `${value.slice(0, revealEnds)}${'•'.repeat(value.length - revealEnds * 2)}${value.slice(-revealEnds)}`
}

interface MaskedSecretConfig {
  message: string
  /** Mirrors `@inquirer/prompts`' password validate so this is a drop-in replacement. */
  validate?: (value: string) => boolean | string | Promise<boolean | string>
  /** How many characters to reveal at each end while typing/pasting. */
  revealEnds?: number
}

/**
 * A password-style prompt that reveals only the ends of the typically pasted value
 * and shows its length, catching a wrong paste
 * before it is stored. Drop-in replacement for `@inquirer/prompts`' `password`:
 * same `{ message, validate? }` config and `Promise<string>` result.
 *
 * The raw value lives only in readline; we render our own masked view, so the
 * full secret is never echoed to the terminal or left in scrollback.
 */
export const maskedSecret = createPrompt<string, MaskedSecretConfig>((config, done) => {
  const { validate = () => true, revealEnds = 3 } = config
  const theme = makeTheme()
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setError] = useState<string>()
  const [value, setValue] = useState('')
  const prefix = usePrefix({ status, theme })

  useKeypress(async (key, rl) => {
    if (status !== 'idle') return

    if (isEnterKey(key)) {
      setStatus('loading')
      const isValid = await validate(value)
      if (isValid === true) {
        setStatus('done')
        done(value)
      } else {
        // Restore the line so the operator can fix the value in place after the
        // line event clears it.
        rl.write(value)
        setError(typeof isValid === 'string' ? isValid : 'You must provide a valid value')
        setStatus('idle')
      }
    } else {
      setValue(rl.line)
      setError(undefined)
    }
  })

  const message = theme.style.message(config.message, status)
  const masked = maskSecret(value, revealEnds)
  const display = status === 'done' ? theme.style.answer(masked) : masked
  const counter = status === 'idle' && value.length > 0 ? ` ${theme.style.help(`(${value.length} chars)`)}` : ''
  const error = errorMsg ? theme.style.error(errorMsg) : ''

  return [`${prefix} ${message} ${display}${counter}`.trimEnd(), error]
})
