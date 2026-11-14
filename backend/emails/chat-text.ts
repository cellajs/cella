import sanitizeHtml, { type IOptions } from 'sanitize-html';
import { escapeString } from './renderer/escape-string';
import { htmlToText } from './renderer/html-to-text';

/** One message as a chat room shows it: a headline, then a quote, links and a note where the message has them. */
export interface ChatText {
  /** Translated inline HTML, its values escaped by the i18n instance. The first line, which a phone shows. */
  headlineHtml: string;
  /** Plain text a person typed, or a record's lines. Quoted under the headline. */
  quote?: string | null;
  links?: { label: string; href: string }[];
  /** Plain text after the links, such as the country and browser of the request. */
  note?: string;
}

/** Statics of a template with a chat text: the mail that replaces a room message says why. */
export interface DeliveryNoteStatic {
  /** Translated HTML, set by `sendToSystemRoom` alone, when the room could not be reached. */
  deliveryNote?: string;
}

/** The content of a Matrix `m.room.message` event. */
export interface MatrixMessageContent {
  msgtype: 'm.text';
  /** The message for a client that shows no HTML, and for a phone's notification. */
  body: string;
  format: 'org.matrix.custom.html';
  formatted_body: string;
  'm.mentions': Record<string, never>;
}

/** What a headline's translation string may hold: emphasis and links. */
const headlinePolicy: IOptions = {
  allowedTags: ['strong', 'em', 'a'],
  allowedAttributes: { a: ['href'] },
  allowedSchemes: ['http', 'https', 'mailto'],
};

const separator = ' · ';

/**
 * A chat text as Matrix message content. The type is `m.text`: a default push rule keeps every `m.notice` silent. The
 * empty `m.mentions` states that the message mentions no one: a typed `@room` pings nobody. Typed text goes out
 * escaped, and the HTML holds only tags a client is told to keep.
 */
export function renderChatText({ headlineHtml, quote, links = [], note }: ChatText): MatrixMessageContent {
  const headline = sanitizeHtml(headlineHtml, headlinePolicy);
  const quoteLines = quote ? quote.split(/\r?\n/) : [];
  const tailText = [...links.map(({ label, href }) => `${label}: ${href}`), ...(note ? [note] : [])];
  const tailHtml = [
    ...links.map(({ label, href }) => `<a href="${escapeString(href)}">${escapeString(label)}</a>`),
    ...(note ? [escapeString(note)] : []),
  ];

  return {
    msgtype: 'm.text',
    body: [htmlToText(headline), ...quoteLines.map((line) => `> ${line}`), tailText.join(separator)].filter(Boolean).join('\n'),
    format: 'org.matrix.custom.html',
    formatted_body: [
      `<p>${headline}</p>`,
      quoteLines.length ? `<blockquote>${quoteLines.map(escapeString).join('<br>')}</blockquote>` : '',
      tailHtml.length ? `<p>${tailHtml.join(separator)}</p>` : '',
    ].join(''),
    'm.mentions': {},
  };
}
