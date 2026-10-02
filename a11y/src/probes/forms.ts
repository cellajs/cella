import type { Page } from 'playwright';
import type { ScopeState } from '../scope.ts';
import type { Session } from '../session.ts';
import { type EvidenceSet, visit } from './visit.ts';

/** Forms whose required fields can be submitted empty without saving anything. */
const requiredFieldForms = ['sign-in', 'contact', 'invite-dialog'];

/** Forms that ask for the user's own details, which 1.3.5 covers. */
const personalForms = ['sign-in', 'contact', 'account'];

/** Submits the first form empty; every invalid field must be marked and described by visible error text. */
function submitEmpty(page: Page) {
  return page.evaluate(async () => {
    const form = document.querySelector('[role="dialog"] form') ?? document.querySelector('main form, form');
    if (!form) return ['no form found'];
    const submit =
      form.querySelector<HTMLButtonElement>('button[type="submit"]') ?? form.querySelector<HTMLButtonElement>('button:not([type="button"])');
    if (!submit) return ['no submit button found'];
    submit.click();
    await new Promise((resolve) => setTimeout(resolve, 800));

    const problems: string[] = [];
    const invalid = [...form.querySelectorAll('[aria-invalid="true"]')];
    const alerts = [...document.querySelectorAll('[role="alert"], [data-slot="form-message"], [data-slot="field-error"]')].filter((el) =>
      el.textContent?.trim(),
    );
    if (!invalid.length && !alerts.length) problems.push('submitting empty shows no identified error');
    for (const field of invalid) {
      const ids = (field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
      const described = ids.some((id) => document.getElementById(id)?.textContent?.trim());
      const label = field.getAttribute('aria-label') ?? field.getAttribute('name') ?? field.tagName.toLowerCase();
      if (!described) problems.push(`${label} is marked invalid but no error text is linked to it`);
    }
    return problems;
  });
}

/** Personal-data inputs without an autocomplete token (1.3.5), and inputs that refuse pasted text (3.3.8). */
function inputPurpose(page: Page) {
  return page.evaluate(() => {
    const purpose: string[] = [];
    const paste: string[] = [];
    const personal = /e-?mail|first|last|full.?name|^name$|phone|tel|username/i;
    for (const input of document.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])')) {
      // A disabled or read-only field collects nothing, so 1.3.5 does not apply
      if (input.disabled || input.readOnly) continue;
      const label = (input.labels?.[0]?.textContent ?? input.getAttribute('aria-label') ?? '').trim();
      const isPersonal = input.type === 'email' || input.type === 'tel' || personal.test(input.name) || personal.test(label);
      const token = input.getAttribute('autocomplete');
      if (isPersonal && (!token || token === 'off' || token === 'on'))
        purpose.push(`"${label || input.name || input.type}" has no autocomplete purpose`);

      const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
      input.dispatchEvent(event);
      if (event.defaultPrevented) paste.push(`"${label || input.name || input.type}" blocks paste`);
    }
    return { purpose, paste };
  });
}

/** Error identification (3.3.1), input purpose (1.3.5) and paste into sign-in fields (3.3.8). */
export async function probeForms(session: Session, states: ScopeState[], evidence: EvidenceSet) {
  const errors = await visit(
    session,
    states.filter((state) => requiredFieldForms.includes(state.id)),
    {},
    submitEmpty,
  );
  evidence.addFromProblems(['3.3.1'], 'probe:form-errors', 'Submitting required fields empty identifies each error in text', errors);

  const inputs = await visit(
    session,
    states.filter((state) => personalForms.includes(state.id)),
    {},
    inputPurpose,
  );
  const purpose = new Map([...inputs].map(([id, found]) => [id, found.purpose]));
  evidence.addFromProblems(['1.3.5'], 'probe:autocomplete', 'Inputs for personal data declare their purpose', purpose);
  const signIn = new Map([...inputs].filter(([id]) => id === 'sign-in').map(([id, found]) => [id, [...found.purpose, ...found.paste]]));
  evidence.addFromProblems(['3.3.8'], 'probe:autocomplete', 'Sign-in fields accept autofill and pasted text', signIn);
}
