import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import type { InviteOutcome } from 'sdk';
import type { InviteForm } from '~/modules/user/invite-submit';
import { isInviteEmail, parseInviteText } from '~/modules/user/invite-text';

/**
 * Someone picked by name, so their chip shows the person, a restored draft too. The outcome is what the search's check
 * answered, which places them until the list's own check answers.
 */
export type InvitePerson = {
  id: string;
  name: string;
  email: string;
  entityType: 'user';
  thumbnailUrl?: string | null;
  outcome?: InviteOutcome;
};

const shouldDirty = { shouldDirty: true };

/** The addresses an invite holds, what was last added to them, and the text on its way in. */
export function useInviteList(form: InviteForm) {
  const emails = useWatch({ control: form.control, name: 'emails' }) ?? [];
  const unparsed = useWatch({ control: form.control, name: 'unparsed' }) ?? [];
  const typed = useWatch({ control: form.control, name: 'typed' }) ?? '';
  const pasted = useWatch({ control: form.control, name: 'pasted' }) ?? '';
  const picked = useWatch({ control: form.control, name: 'people' }) ?? [];
  const people = new Map(picked.map((person) => [person.email.toLowerCase(), person]));

  const [last, setLast] = useState<{ address: string; repeat: boolean } | null>(null);
  const [typedInvalid, setTypedInvalid] = useState(false);
  // Moves with each addition, which is when the open tile is worked out again.
  const [revision, setRevision] = useState(0);

  const merge = (text: string, without?: string) => {
    const parsed = parseInviteText(text);
    const held = form.getValues('emails') ?? [];
    const others = (form.getValues('unparsed') ?? []).filter((item) => item !== without);
    const newEmails = parsed.emails.filter((email) => !held.includes(email));
    form.setValue('emails', [...held, ...newEmails], shouldDirty);
    form.setValue('unparsed', [...new Set([...others, ...parsed.unparsed])], shouldDirty);
    setRevision((current) => current + 1);
    setTypedInvalid(false);
    return { parsed, newEmails };
  };

  /** Adds any text. One address is reported on the line under the field; a list speaks through its tiles. */
  const add = (text: string) => {
    const { parsed, newEmails } = merge(text);
    const single = parsed.emails.length === 1 && !parsed.unparsed.length;
    setLast(single ? { address: parsed.emails[0], repeat: !newEmails.length } : null);
  };

  /** Moves a whole address out of the field and into the list. Answers false for a partial one, which stays and is marked. */
  const commitTyped = (text?: string) => {
    const value = (text ?? form.getValues('typed') ?? '').trim();
    if (!value) return true;
    if (!isInviteEmail(value)) {
      setTypedInvalid(true);
      return false;
    }
    add(value);
    form.setValue('typed', '', shouldDirty);
    return true;
  };

  /** Moves the paste box's text into the list. Answers false when it held any, so the list is checked before a send. */
  const commitPasted = () => {
    const text = form.getValues('pasted') ?? '';
    if (!text.trim()) return true;
    add(text);
    form.setValue('pasted', '', shouldDirty);
    return false;
  };

  /** A switch of mode adds a whole address and drops a partial one. Text in the paste box joins the list. */
  const leaveField = () => {
    commitTyped();
    commitPasted();
    form.setValue('typed', '', shouldDirty);
    setTypedInvalid(false);
    setLast(null);
  };

  return {
    emails,
    unparsed,
    typed,
    pasted,
    last,
    typedInvalid,
    people,
    revision,
    hasList: emails.length + unparsed.length > 0,
    /** A whole address in the field goes out with the rest. */
    typedAddress: isInviteEmail(typed.trim()) && !emails.includes(typed.trim().toLowerCase()) ? typed.trim() : null,
    add,
    commitTyped,
    commitPasted,
    leaveField,
    setTyped: (value: string) => {
      form.setValue('typed', value, shouldDirty);
      setTypedInvalid(false);
    },
    setPasted: (value: string) => form.setValue('pasted', value, shouldDirty),
    addPerson: (person: InvitePerson) => {
      const others = (form.getValues('people') ?? []).filter(({ email }) => email.toLowerCase() !== person.email.toLowerCase());
      form.setValue('people', [...others, person], shouldDirty);
      add(person.email);
    },
    remove: (address: string) => {
      form.setValue(
        'emails',
        emails.filter((email) => email !== address),
        shouldDirty,
      );
      form.setValue(
        'unparsed',
        unparsed.filter((item) => item !== address),
        shouldDirty,
      );
      form.setValue(
        'people',
        picked.filter(({ email }) => email.toLowerCase() !== address),
        shouldDirty,
      );
      setLast(null);
    },
    /** Replaces a near-miss with the corrected text. */
    fix: (address: string, text: string) => {
      if (text === address) return;
      merge(text, address);
      setLast(null);
    },
    reset: () => {
      form.reset();
      setLast(null);
      setTypedInvalid(false);
      setRevision((current) => current + 1);
    },
  };
}

export type InviteList = ReturnType<typeof useInviteList>;
