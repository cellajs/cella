import type React from 'react';

/** Style for avatar row above email headers */
export const avatarRowStyle: React.CSSProperties = { margin: '1.5rem 0 1rem' };

/** Style for "Hi name," greeting paragraph */
export const greetingStyle: React.CSSProperties = { marginBottom: '4px' };

/** Base small text style (0.75rem) */
export const smallTextStyle: React.CSSProperties = { fontSize: '0.75rem', lineHeight: '1.125rem' };

/** Centered small text for fine print / notes */
export const finePrintStyle: React.CSSProperties = { ...smallTextStyle, textAlign: 'center' };

/** Centered small text with top margin for invite expiry notes */
export const noteStyle: React.CSSProperties = { ...finePrintStyle, margin: '0.5rem 0 0 0' };

/**
 * CSS for newsletter content rendered by BlockNote's blocksToHTMLLossy().
 * Mirrors key styles from frontend/src/modules/common/blocknote/styles.css
 * so newsletters closely match the editor appearance.
 */
export const newsletterContentStyles = `
  .bn-email-content {
    font-family: "Open Sans", ui-sans-serif, system-ui, sans-serif;
    font-size: 0.888rem;
    line-height: 1.5;
    color: #404040;
  }
  .bn-email-content p {
    font-size: 0.888rem;
    font-weight: 400;
    margin: 0.25rem 0;
    padding: 0;
  }
  .bn-email-content h1 {
    font-size: 1.8rem;
    font-weight: 700;
    margin: 1rem 0 0.5rem;
  }
  .bn-email-content h2 {
    font-size: 1.4rem;
    font-weight: 700;
    margin: 0.75rem 0 0.5rem;
  }
  .bn-email-content h3 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0.5rem 0 0.25rem;
  }
  .bn-email-content a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 0.2rem;
  }
  .bn-email-content strong,
  .bn-email-content b {
    font-weight: 600;
  }
  .bn-email-content code {
    font-size: 0.85em;
    background: #f0f0f0;
    color: #e8912d;
    border-radius: 0.25rem;
    padding: 0.15rem 0.3rem;
  }
  .bn-email-content pre {
    background: #1e1e1e;
    color: #fff;
    border-radius: 0.5rem;
    padding: 1rem;
    overflow-x: auto;
  }
  .bn-email-content pre code {
    background: transparent;
    color: inherit;
    padding: 0;
    border: none;
    border-radius: 0;
  }
  .bn-email-content ul,
  .bn-email-content ol {
    padding-left: 1.5rem;
    margin: 0.25rem 0;
  }
  .bn-email-content li {
    margin: 0.125rem 0;
  }
  .bn-email-content table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.5rem 0;
  }
  .bn-email-content td,
  .bn-email-content th {
    padding: 4px 8px;
    border: 1px solid #ddd;
  }
  .bn-email-content th {
    font-weight: 600;
    background: #f9f9f9;
  }
  .bn-email-content .notify {
    display: flex;
    align-items: center;
    border-radius: 4px;
    min-height: 32px;
    padding: 8px 12px;
    margin: 0.25rem 0;
  }
  .bn-email-content .notify[data-notify-type="warning"] {
    background-color: #fff6e6;
  }
  .bn-email-content .notify[data-notify-type="error"] {
    background-color: #ffe6e6;
  }
  .bn-email-content .notify[data-notify-type="info"] {
    background-color: #e6ebff;
  }
  .bn-email-content .notify[data-notify-type="success"] {
    background-color: #e6ffe6;
  }
  .bn-email-content input[type="checkbox"] {
    margin: 0 0.5em 0.4em 0;
  }
  .bn-email-content img {
    max-width: 100%;
    height: auto;
    border-radius: 0.25rem;
  }
`;
