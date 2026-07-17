/**
 * ════════════════════════════════════════════
 *  دين (Deen) — Language Toggle Component
 * ════════════════════════════════════════════
 *  Renders a standalone language switch button
 *  (Arabic ↔ English) and wires up the click
 *  handler to the i18n toggleLang function.
 * ════════════════════════════════════════════
 */

import { getLang, toggleLang } from '../i18n/index.js';

// ── Render ─────────────────────────────────

/**
 * Render the language toggle button
 * @returns {string} Button markup
 */
export function renderLangToggle() {
  const lang = getLang();

  return `
    <button class="lang-toggle" id="lang-toggle" aria-label="Toggle Language">
      ${lang === 'ar' ? 'EN' : 'ع'}
    </button>
  `;
}

// ── Events ─────────────────────────────────

/**
 * Attach click handler to the language toggle.
 * Must be called after renderLangToggle() output is in the DOM.
 */
export function initLangToggle() {
  document.getElementById('lang-toggle')?.addEventListener('click', toggleLang);
}
