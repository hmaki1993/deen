/**
 * ════════════════════════════════════════════
 *  دين (Deen) — App Header Component
 * ════════════════════════════════════════════
 *  Top navigation bar with app title, theme
 *  toggle, and language switch controls.
 * ════════════════════════════════════════════
 */

import { t, getLang, toggleLang } from '../i18n/index.js';

// ── Theme helpers ──────────────────────────

/**
 * Get the current theme from the root element
 * @returns {'dark'|'light'}
 */
function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

/**
 * Toggle between dark and light themes,
 * persist to localStorage, and update the icon
 */
function toggleTheme() {
  const current = getTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('deen-theme', next);
  updateThemeIcon();
}

/**
 * Sync the theme button icon with current state
 */
function updateThemeIcon() {
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = getTheme() === 'dark' ? '☀️' : '🌙';
}

// ── Render ─────────────────────────────────

/**
 * Render the app header HTML
 * @returns {string} Header markup
 */
export function renderHeader() {
  return `
    <header class="app-header">
      <h1 class="app-title">${t('app_name')}</h1>
      <div class="header-actions">
        <button id="lang-toggle-btn" class="header-btn" aria-label="Toggle Language">
          ${getLang() === 'ar' ? 'EN' : 'ع'}
        </button>
        <button id="theme-toggle-btn" class="header-btn" aria-label="Toggle Theme">
          ${getTheme() === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </header>
  `;
}

// ── Events ─────────────────────────────────

/**
 * Attach click handlers to header buttons.
 * Must be called after renderHeader() output is in the DOM.
 */
export function initHeaderEvents() {
  document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);
  document.getElementById('lang-toggle-btn')?.addEventListener('click', () => {
    toggleLang();
  });
}
