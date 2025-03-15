// Original source: https://github.com/axisj/react-multi-email

// This file is a modified version of the original source code.
// Removed autofocus
// Use shadcn UI components and css

import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '~/modules/ui/badge';
import { inputClass } from '~/modules/ui/input';
import { cn } from '~/utils/cn';
import { isEmail as isEmailFn } from '~/utils/is-email';

export interface SelectEmailsProps {
  id?: string;
  emails?: string[];
  onChange?: (emails: string[]) => void;
  enable?: ({ emailCnt }: { emailCnt: number }) => boolean;
  onDisabled?: () => void;
  onChangeInput?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (evt: React.KeyboardEvent<HTMLInputElement>) => void;
  onKeyUp?: (evt: React.KeyboardEvent<HTMLInputElement>) => void;
  noClass?: boolean;
  validateEmail?: (email: string) => boolean | Promise<boolean>;
  enableSpinner?: boolean;
  style?: React.CSSProperties;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  spinner?: () => React.ReactNode;
  delimiter?: string;
  initialInputValue?: string;
  autoComplete?: string;
  disableOnBlurValidation?: boolean;
  allowDisplayName?: boolean;
  stripDisplayName?: boolean;
  allowDuplicate?: boolean;
}

export const SelectEmails = (props: SelectEmailsProps) => {
  const {
    id,
    style,
    className = '',
    noClass,
    placeholder,
    allowDisplayName = false,
    stripDisplayName = false,
    allowDuplicate = false,
    delimiter = `[${allowDisplayName ? '' : ' '},;]`,
    initialInputValue = '',
    inputClassName,
    autoComplete,
    enable,
    onDisabled,
    validateEmail,
    onChange,
    onChangeInput,
    onFocus,
    onBlur,
    onKeyDown,
    onKeyUp,
    spinner,
    disableOnBlurValidation = false,
  } = props;
  const emailInputRef = useRef<HTMLInputElement>(null);

  const [focused, setFocused] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [spinning, setSpinning] = useState(false);

  const findEmailAddress = useCallback(
    async (value: string, isEnter?: boolean) => {
      const validEmails: string[] = [];
      let inputValue = '';
      const re = new RegExp(delimiter, 'g');
      const isEmail = validateEmail || isEmailFn;

      const addEmails = (email: string) => {
        if (!allowDuplicate) {
          for (let i = 0, l = emails.length; i < l; i++) {
            if (emails[i].toLowerCase() === email.toLowerCase()) {
              return false;
            }
          }
        }
        validEmails.push(email);
        return true;
      };

      if (value !== '') {
        if (re.test(value)) {
          const setArr = new Set(value.split(re).filter((n) => n));

          const arr = [...setArr];
          while (arr.length) {
            const validateResult = isEmail(`${arr[0].trim()}`);
            if (typeof validateResult === 'boolean') {
              if (validateResult) {
                addEmails(`${arr.shift()?.trim()}`);
              } else {
                if (allowDisplayName) {
                  const validateResultWithDisplayName = isEmail(`${arr[0].trim()}`, { allowDisplayName });
                  if (validateResultWithDisplayName) {
                    // Strip display name from email formatted as such "First Last <first.last@domain.com>"
                    const email = stripDisplayName ? arr.shift()?.split('<')[1].split('>')[0] : arr.shift();
                    addEmails(`${email}`);
                  } else {
                    if (arr.length === 1) {
                      inputValue = `${arr.shift()}`;
                    } else {
                      arr.shift();
                    }
                  }
                } else {
                  inputValue = `${arr.shift()}`;
                }
              }
            } else {
              // handle promise
              setSpinning(true);
              if ((await validateEmail?.(value)) === true) {
                addEmails(`${arr.shift()}`);
                setSpinning(false);
              } else {
                if (arr.length === 1) {
                  inputValue = `${arr.shift()}`;
                } else {
                  arr.shift();
                }
              }
            }
          }
        } else {
          if (enable && !enable({ emailCnt: emails.length })) {
            onDisabled?.();
            return;
          }

          if (isEnter) {
            const validateResult = isEmail(value);
            if (typeof validateResult === 'boolean') {
              if (validateResult) {
                addEmails(value);
              } else if (allowDisplayName) {
                const validateResultWithDisplayName = isEmail(value, { allowDisplayName });
                if (validateResultWithDisplayName) {
                  // Strip display name from email formatted as such "First Last <first.last@domain.com>"
                  const email = stripDisplayName ? value.split('<')[1].split('>')[0] : value;
                  addEmails(email);
                } else {
                  inputValue = value;
                }
              } else {
                inputValue = value;
              }
            } else {
              // handle promise
              setSpinning(true);
              if ((await validateEmail?.(value)) === true) {
                addEmails(value);
              } else {
                inputValue = value;
              }
              setSpinning(false);
            }
          } else {
            inputValue = value;
          }
        }
      }

      setEmails([...emails, ...validEmails]);
      setInputValue(inputValue);

      if (validEmails.length) {
        onChange?.([...emails, ...validEmails]);
      }

      // biome-ignore lint/suspicious/noSelfCompare: <explanation>
      if (inputValue !== inputValue) {
        onChangeInput?.(inputValue);
      }
    },
    [allowDisplayName, allowDuplicate, delimiter, emails, enable, onChange, onChangeInput, onDisabled, stripDisplayName, validateEmail],
  );

  const onChangeInputValue = useCallback(
    async (value: string) => {
      await findEmailAddress(value);
      onChangeInput?.(value);
    },
    [findEmailAddress, onChangeInput],
  );

  const removeEmail = useCallback(
    (index: number, isDisabled?: boolean) => {
      if (isDisabled) {
        return;
      }

      const _emails = [...emails.slice(0, index), ...emails.slice(index + 1)];
      setEmails(_emails);
      onChange?.(_emails);
    },
    [emails, onChange],
  );

  const handleOnKeydown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(e);

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          break;
        case 'Backspace':
          if (!e.currentTarget.value) {
            removeEmail(emails.length - 1, false);
          }
          break;
        default:
      }
    },
    [emails.length, onKeyDown, removeEmail],
  );

  const handleOnKeyup = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyUp?.(e);

      switch (e.key) {
        case 'Enter':
          await findEmailAddress(e.currentTarget.value, true);
          break;
        default:
      }
    },
    [findEmailAddress, onKeyUp],
  );

  const handleOnChange = useCallback(
    async (e: React.SyntheticEvent<HTMLInputElement>) => await onChangeInputValue(e.currentTarget.value),
    [onChangeInputValue],
  );

  const handleOnBlur = useCallback(
    async (e: React.SyntheticEvent<HTMLInputElement>) => {
      setFocused(false);
      if (!disableOnBlurValidation) {
        await findEmailAddress(e.currentTarget.value, true);
      }
      onBlur?.();
    },
    [disableOnBlurValidation, findEmailAddress, onBlur],
  );

  const handleOnFocus = useCallback(() => {
    setFocused(true);
    onFocus?.();
  }, [onFocus]);

  useEffect(() => {
    setInputValue(initialInputValue);
  }, [initialInputValue]);

  useEffect(() => {
    if (validateEmail) {
      (async () => {
        setSpinning(true);

        const validEmails: string[] = [];
        for await (const email of props.emails ?? []) {
          if (await validateEmail(email)) {
            validEmails.push(email);
          }
        }
        setEmails(validEmails);

        setSpinning(false);
      })();
    } else {
      const validEmails = props.emails?.filter((email) => {
        if (!email) return false;
        return isEmailFn(email);
      });
      setEmails(validEmails ?? []);
    }
  }, [props.emails, validateEmail]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
    <div
      className={cn(
        inputClass,
        'relative flex-wrap h-auto',
        className,
        noClass ? '' : 'react-multi-email',
        focused ? 'focused' : '',
        inputValue === '' && emails.length === 0 ? 'empty' : 'fill',
      )}
      style={style}
      onClick={() => emailInputRef.current?.focus()}
    >
      {spinning && spinner?.()}
      <div className="flex flex-wrap gap-1 w-full" style={{ opacity: spinning ? 0.45 : 1.0 }}>
        {emails.map((email: string, index: number) => {
          return (
            <Badge
              size="sm"
              variant="secondary"
              key={email}
              className={cn(
                'data-disabled:bg-muted-foreground data-disabled:text-muted data-disabled:hover:bg-muted-foreground',
                'data-fixed:bg-muted-foreground data-fixed:text-muted data-fixed:hover:bg-muted-foreground max-w-60',
              )}
            >
              <span className="truncate">{email}</span>
              <button
                type="button"
                className={cn(
                  'py-1 m-[-.25rem] ml-1 rounded-full outline-hidden sm:ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                )}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    removeEmail(index);
                  }
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => removeEmail(index)}
              >
                <X className="h-4 w-4 opacity-50 hover:opacity-100" />
              </button>
            </Badge>
          );
        })}

        <input
          id={id}
          style={{ opacity: spinning ? 0.45 : 1.0 }}
          ref={emailInputRef}
          type="text"
          value={inputValue}
          onFocus={handleOnFocus}
          placeholder={placeholder || ''}
          onBlur={handleOnBlur}
          onChange={handleOnChange}
          onKeyDown={handleOnKeydown}
          onKeyUp={handleOnKeyup}
          className={cn(
            inputClassName,
            'ml-1 grow placeholder:text-muted-foreground w-auto outline-hidden bg-transparent! border-0 inline-block leading-none py-1',
          )}
          autoComplete={autoComplete}
        />
      </div>
    </div>
  );
};
