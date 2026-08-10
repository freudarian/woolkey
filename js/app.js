/**
 * app.js
 * Orchestration — wires UI events to generation logic.
 * Depends on: crypto-random.js, password-generator.js, passphrase-generator.js,
 *             entropy.js, clipboard.js, ui.js, data/words.js
 */

'use strict';

let _mode = 'password'; // 'password' | 'passphrase'

/* ── Generation ──────────────────────────────────────────────── */

function generate() {
  try {
    if (!isCryptoAvailable()) {
      setOutputValue('Web Crypto API not available in this browser.');
      return;
    }

    if (_mode === 'password') {
      const opts = getPasswordOptions();
      const password = generatePassword(opts);
      const pool = passwordPoolSize(opts);
      const bits = passwordEntropy(opts.length, pool);
      const { label, level } = strengthLabel(bits);
      setOutputValue(password);
      updateEntropyDisplay(bits, level, label);
    } else {
      const opts = getPassphraseOptions();
      const phrase = generatePassphrase(opts);
      const bits = passphraseEntropy(opts.wordCount, WORDS.length);
      const { label, level } = strengthLabel(bits);
      setOutputValue(phrase);
      updateEntropyDisplay(bits, level, label);
    }
  } catch (err) {
    setOutputValue('Error: ' + err.message);
  }
}

/* ── Event wiring ────────────────────────────────────────────── */

function init() {
  // Mode toggle
  UI.modePassword?.addEventListener('click', () => {
    _mode = 'password';
    setMode('password');
    generate();
  });
  UI.modePassphrase?.addEventListener('click', () => {
    _mode = 'passphrase';
    setMode('passphrase');
    generate();
  });

  // Regenerate
  UI.regenBtn?.addEventListener('click', generate);

  // Toggle visibility
  UI.toggleBtn?.addEventListener('click', toggleVisibility);

  // Copy
  UI.copyBtn?.addEventListener('click', async () => {
    const val = getOutputValue();
    if (!val) return;
    try {
      await copyToClipboard(val);
      showCopyFeedback();
    } catch {
      // Silently ignore clipboard errors
    }
  });

  // Password option changes → regenerate
  UI.lengthSlider?.addEventListener('input', () => {
    updateLengthDisplay(UI.lengthSlider.value);
    generate();
  });
  [UI.chkLower, UI.chkUpper, UI.chkNumbers, UI.chkSymbols,
   UI.chkAmbiguous, UI.excludeInput].forEach((el) => {
    el?.addEventListener('change', generate);
  });
  UI.excludeInput?.addEventListener('input', generate);

  // Passphrase option changes → regenerate
  UI.wordCountSlider?.addEventListener('input', () => {
    updateWordCountDisplay(UI.wordCountSlider.value);
    generate();
  });
  [UI.separatorSelect, UI.chkCapitalize, UI.chkAddNumber].forEach((el) => {
    el?.addEventListener('change', generate);
  });

  // Initial state
  setMode('password');
  updateLengthDisplay(UI.lengthSlider?.value ?? 24);
  updateWordCountDisplay(UI.wordCountSlider?.value ?? 4);
  updateToggleLabel();
  generate();
}

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}

document.addEventListener('DOMContentLoaded', init);
