import type { ClipboardEvent } from 'react';
import { zInviteMembersBody } from 'sdk/zod.gen';

/** True for exactly the addresses an invite submit accepts, so everything added to the list passes the form. */
export const isInviteEmail = (value: string) => zInviteMembersBody.shape.emails.element.safeParse(value).success;

// Bounded on both sides, so a character no address may hold fails it whole: jöhn@x.com never reads as hn@x.com, nor a@x.xn--p1ai as a@x.xn.
const addressPattern = /(?<![^\s<(:"[])[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?![A-Z0-9_-])/gi;

/**
 * Reads any text as invite addresses: each line or comma- or semicolon-separated part gives the addresses in it,
 * lowercased and without repeats, and a part with none stays as `unparsed` so the form can name it.
 */
export const parseInviteText = (text: string) => {
  const emails = new Set<string>();
  const unparsed = new Set<string>();

  // A display name goes first: the comma in "Doe, Jane" <jane@x.com> separates nothing.
  for (const part of text.replace(/"[^"\n]*"(?=\s*<)/g, ' ').split(/[\n\r,;]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const found = (isInviteEmail(trimmed) ? [trimmed] : (trimmed.match(addressPattern) ?? []))
      .map((email) => email.toLowerCase())
      .filter(isInviteEmail);
    for (const email of found) emails.add(email);
    if (!found.length) unparsed.add(trimmed);
  }

  return { emails: [...emails], unparsed: [...unparsed] };
};

/** The field's text with a paste in place of its selection, on lines of its own: an address typed before it stays whole. */
export const withPasted = (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  const { value, selectionStart, selectionEnd } = event.currentTarget;
  return `${value.slice(0, selectionStart ?? value.length)}\n${event.clipboardData.getData('text')}\n${value.slice(selectionEnd ?? value.length)}`;
};
