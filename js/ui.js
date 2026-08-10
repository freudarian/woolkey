/**
 * ui.js
 * DOM interaction and rendering.
 * Depends on: crypto-random.js, entropy.js (for display)
 */

'use strict';

/* ── DOM references ─────────────────────────────────────────── */
const UI = {
  get output()         { return document.getElementById('output'); },
  get copyBtn()        { return document.getElementById('copy-btn'); },
  get regenBtn()       { return document.getElementById('regen-btn'); },
  get toggleBtn()      { return document.getElementById('toggle-visibility'); },
  get modePassword()   { return document.getElementById('mode-password'); },
  get modePassphrase() { return document.getElementById('mode-passphrase'); },

  // Password options
  get lengthSlider()   { return document.getElementById('length'); },
  get lengthValue()    { return document.getElementById('length-value'); },
  get chkLower()       { return document.getElementById('chk-lower'); },
  get chkUpper()       { return document.getElementById('chk-upper'); },
  get chkNumbers()     { return document.getElementById('chk-numbers'); },
  get chkSymbols()     { return document.getElementById('chk-symbols'); },
  get chkAmbiguous()   { return document.getElementById('chk-ambiguous'); },
  get excludeInput()   { return document.getElementById('exclude-chars'); },

  // Passphrase options
  get wordCountSlider(){ return document.getElementById('word-count'); },
  get wordCountValue() { return document.getElementById('word-count-value'); },
  get separatorSelect(){ return document.getElementById('separator'); },
  get chkCapitalize()  { return document.getElementById('chk-capitalize'); },
  get chkAddNumber()   { return document.getElementById('chk-add-number'); },

  // Panels
  get passwordPanel()  { return document.getElementById('password-panel'); },
  get passphrasePanel(){ return document.getElementById('passphrase-panel'); },

  // Entropy display
  get entropyDisplay() { return document.getElementById('entropy-display'); },
  get strengthBar()    { return document.getElementById('strength-bar'); },
  get strengthLabel()  { return document.getElementById('strength-label'); },

  // Copy feedback
  get copyFeedback()   { return document.getElementById('copy-feedback'); },
};

/* ── Render helpers ──────────────────────────────────────────── */

let _hidden = true;

function setOutputValue(text) {
  const el = UI.output;
  if (!el) return;
  el.dataset.value = text;
  el.textContent = _hidden ? '•'.repeat(text.length) : text;
}

function getOutputValue() {
  const el = UI.output;
  return el ? (el.dataset.value || el.textContent) : '';
}

function updateToggleLabel() {
  const btn = UI.toggleBtn;
  if (!btn) return;
  const eyeOff = document.getElementById('icon-eye-off');
  const eye    = document.getElementById('icon-eye');
  if (eyeOff) eyeOff.hidden = !_hidden;
  if (eye)    eye.hidden    = _hidden;
  btn.setAttribute('aria-label', _hidden ? 'Show password' : 'Hide password');
  btn.setAttribute('aria-pressed', String(_hidden));
}

function toggleVisibility() {
  _hidden = !_hidden;
  const value = getOutputValue();
  const el = UI.output;
  if (!el) return;
  el.textContent = _hidden ? '•'.repeat(value.length) : value;
  updateToggleLabel();
}

function updateLengthDisplay(value) {
  if (UI.lengthValue) UI.lengthValue.textContent = value;
}

function updateWordCountDisplay(value) {
  if (UI.wordCountValue) UI.wordCountValue.textContent = value;
}

function updateEntropyDisplay(bits, level, label) {
  if (UI.entropyDisplay) {
    UI.entropyDisplay.textContent = 'Estimated entropy: ' + formatEntropy(bits);
  }
  if (UI.strengthBar) {
    UI.strengthBar.style.width = Math.min(100, (bits / 128) * 100) + '%';
    UI.strengthBar.className = 'strength-bar level-' + level;
  }
  if (UI.strengthLabel) {
    UI.strengthLabel.textContent = label;
    UI.strengthLabel.className = 'strength-label level-' + level;
  }
}

function showCopyFeedback() {
  const el = UI.copyFeedback;
  if (!el) return;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2000);
}

function setMode(mode) {
  const isPassword = mode === 'password';
  if (UI.passwordPanel) UI.passwordPanel.hidden = !isPassword;
  if (UI.passphrasePanel) UI.passphrasePanel.hidden = isPassword;
  if (UI.modePassword) {
    UI.modePassword.classList.toggle('active', isPassword);
    UI.modePassword.setAttribute('aria-pressed', String(isPassword));
  }
  if (UI.modePassphrase) {
    UI.modePassphrase.classList.toggle('active', !isPassword);
    UI.modePassphrase.setAttribute('aria-pressed', String(!isPassword));
  }
}

function getPasswordOptions() {
  return {
    length:              parseInt(UI.lengthSlider?.value ?? 24, 10),
    includeLowercase:    UI.chkLower?.checked ?? true,
    includeUppercase:    UI.chkUpper?.checked ?? true,
    includeNumbers:      UI.chkNumbers?.checked ?? true,
    includeSymbols:      UI.chkSymbols?.checked ?? false,
    avoidAmbiguous:      UI.chkAmbiguous?.checked ?? false,
    excludedCharacters:  UI.excludeInput?.value ?? '',
  };
}

function getPassphraseOptions() {
  return {
    wordCount:  parseInt(UI.wordCountSlider?.value ?? 4, 10),
    separator:  UI.separatorSelect?.value ?? 'hyphen',
    capitalize: UI.chkCapitalize?.checked ?? false,
    addNumber:  UI.chkAddNumber?.checked ?? false,
  };
}
