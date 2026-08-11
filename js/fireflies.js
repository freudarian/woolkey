/**
 * fireflies.js
 * Builds the decorative firefly layer for the night scene.
 *
 * The elements are empty divs — every position, orbit and flash timing
 * already lives in css/fireflies.css, because the site CSP sets
 * style-src 'self' and inline style attributes are therefore blocked.
 * Keep QUANTITY in sync with the generator that writes that stylesheet.
 */

'use strict';

(function () {
  const QUANTITY = 15;

  document.addEventListener('DOMContentLoaded', () => {
    if (!document.body.classList.contains('scenic')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const layer = document.createElement('div');
    layer.className = 'fireflies';
    layer.setAttribute('aria-hidden', 'true');

    for (let i = 0; i < QUANTITY; i++) {
      layer.appendChild(document.createElement('div')).className = 'firefly';
    }

    document.body.appendChild(layer);
  });
}());
