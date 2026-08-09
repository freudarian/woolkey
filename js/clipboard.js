/**
 * clipboard.js
 * Clipboard copy utility.
 * Does not log copied values.
 */

'use strict';

/**
 * Copy text to the clipboard.
 * Uses navigator.clipboard (async) with a textarea fallback.
 * @param {string} text - Text to copy
 * @returns {Promise<void>}
 */
async function copyToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for environments without clipboard API
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}
