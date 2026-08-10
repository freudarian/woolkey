/**
 * api-doc.js
 * Copy-to-clipboard buttons for the code samples on the API page.
 * Depends on: clipboard.js
 */

'use strict';

(function () {
  const RESET_MS = 1600;

  function flash(button, message, failed) {
    button.textContent = message;
    button.classList.toggle('copied', !failed);
    window.setTimeout(() => {
      button.textContent = button.dataset.label;
      button.classList.remove('copied');
    }, RESET_MS);
  }

  document.querySelectorAll('.copy-code[data-copy]').forEach((button) => {
    button.dataset.label = button.textContent.trim();

    button.addEventListener('click', async () => {
      const block = button.closest('.code-block');
      const code = block && block.querySelector('code');
      if (!code) return;

      try {
        await copyToClipboard(code.innerText);
        flash(button, 'Copied', false);
      } catch {
        // Denied permission, or the document is not focused. Nothing useful to
        // retry — tell the reader to copy the selection by hand instead.
        flash(button, 'Press Ctrl+C', true);
      }
    });
  });
}());
