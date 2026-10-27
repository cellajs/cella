import type React from 'react';
import { appConfig } from 'shared';

export const avatarRowStyle: React.CSSProperties = { margin: '1.5rem 0 1rem' };

export const greetingStyle: React.CSSProperties = { marginBottom: '4px' };

export const smallTextStyle: React.CSSProperties = { fontSize: '0.75rem', lineHeight: '1.125rem' };

/** The colors of the mail's own dark styles; a client that recolors a mail on its own picks colors of its own. */
export const darkPalette = { page: '#141414', panel: '#1f1f1f', border: '#2e2e2e', text: '#e5e5e5', muted: '#a3a3a3', heading: '#fafafa' };

const { darkButton, darkButtonLabel } = appConfig.theme.email;

/**
 * Head styles every mail carries: links underlined, since no link color reads well on both white and dark, and the dark
 * styles. Those apply where a client honors `prefers-color-scheme` (Apple Mail, the Outlook apps) and need `!important`
 * over the inline styles; Gmail and Outlook for Windows ignore them, so the inline colors hold up in a recolored mail.
 */
export const headStyles = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  .email-panel a { text-decoration: underline; }
  .email-muted a { color: #666666; }
  @media (prefers-color-scheme: dark) {
    .email-page { background-color: ${darkPalette.page} !important; }
    .email-heading, .email-heading * { color: ${darkPalette.heading} !important; }
    .email-panel { background-color: ${darkPalette.panel} !important; border-color: ${darkPalette.border} !important; color: ${darkPalette.text} !important; }
    .email-divider { border-color: ${darkPalette.border} !important; }
    .bn-email-content { color: ${darkPalette.text} !important; }
    .email-panel a { color: #8ab4f8 !important; }
    .email-muted, .email-muted a { color: ${darkPalette.muted} !important; }
    .email-panel a.email-button { background-color: ${darkButton} !important; border-color: ${darkButton} !important; color: ${darkButtonLabel} !important; }
    .email-logo { display: none !important; }
    .email-logo-dark { display: block !important; max-height: none !important; }
  }
`;

const finePrintStyle: React.CSSProperties = { ...smallTextStyle, textAlign: 'center' };

export const noteStyle: React.CSSProperties = { ...finePrintStyle, margin: '0.5rem 0 0 0' };

/** Mirrors frontend/src/modules/common/blocknote/styles.css so newsletters match the editor. */
export const newsletterContentStyles = `
  .bn-email-content {
    font-family: "Inter Variable", ui-sans-serif, system-ui, sans-serif;
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
