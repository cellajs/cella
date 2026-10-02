import type { Page } from 'playwright';
import type { Check } from '../findings.ts';

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

/** Error identification (3.3.1). Submitting changes the page, so this runs late in a visit. */
export const formErrors: Check = async (page, state) => {
  if (!requiredFieldForms.includes(state.id)) return [];
  const problems = await submitEmpty(page);
  // A failed submit may raise a toast, which would lie over other controls during the next check
  await page.waitForFunction(() => !document.querySelector('[data-slot="toast"]'), null, { timeout: 8000 }).catch(() => undefined);
  return [{ criteria: ['3.3.1'], check: 'probe:form-errors', what: 'Submitting required fields empty identifies each error in text', problems }];
};

/** Input purpose (1.3.5), and autofill and paste into the sign-in fields (3.3.8). */
export const inputs: Check = async (page, state) => {
  if (!personalForms.includes(state.id)) return [];
  const { purpose, paste } = await inputPurpose(page);
  const findings: Awaited<ReturnType<Check>> = [
    { criteria: ['1.3.5'], check: 'probe:autocomplete', what: 'Inputs for personal data declare their purpose', problems: purpose },
  ];
  if (state.id === 'sign-in') {
    findings.push({
      criteria: ['3.3.8'],
      check: 'probe:autocomplete',
      what: 'Sign-in fields accept autofill and pasted text',
      problems: [...purpose, ...paste],
    });
  }
  return findings;
};
