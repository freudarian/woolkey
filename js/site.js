'use strict';

(function () {
  const STORAGE_KEY = 'woolkey-theme';
  const META_THEME = document.querySelector('meta[name="theme-color"]');
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function resolveTheme(choice) {
    return choice === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : choice;
  }

  function updateThemeColor(theme) {
    if (!META_THEME) return;
    META_THEME.setAttribute('content', theme === 'light' ? '#f5f7fb' : '#0f1117');
  }

  function updateButtons(choice) {
    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
      const active = button.getAttribute('data-theme-choice') === choice;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function applyTheme(choice) {
    const resolved = resolveTheme(choice);
    document.documentElement.dataset.theme = resolved;
    updateThemeColor(resolved);
    updateButtons(choice);
  }

  function getStoredTheme() {
    return localStorage.getItem(STORAGE_KEY) || 'system';
  }

  function setCurrentYear() {
    const year = String(new Date().getFullYear());
    document.querySelectorAll('[data-current-year]').forEach((node) => {
      node.textContent = year;
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const initialChoice = getStoredTheme();
    applyTheme(initialChoice);
    setCurrentYear();

    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        const choice = button.getAttribute('data-theme-choice') || 'system';
        localStorage.setItem(STORAGE_KEY, choice);
        applyTheme(choice);
      });
    });
  });

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', () => {
      if (getStoredTheme() === 'system') applyTheme('system');
    });
  }
}());
