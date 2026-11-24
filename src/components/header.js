/**
 * دين (Deen) — App Header Component
 * Uses theme-toggle.js as single source of truth + crisp SVG icons.
 */

import { t, getLang, toggleLang } from '../i18n/index.js';
import { getTheme, toggleTheme } from './theme-toggle.js';

function getThemeIconSvg(theme) {
  if (theme === 'dark') {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
  }
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
}

function updateThemeIcon() {
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.innerHTML = getThemeIconSvg(getTheme());
}

export function renderHeader() {
  return `
    <header class="app-header">
      <h1 class="app-title">${t('app_name')}</h1>
      <div class="header-actions">
        <button id="lang-toggle-btn" class="header-btn" aria-label="${t('settings_language')}">
          ${getLang() === 'ar' ? 'EN' : 'ع'}
        </button>
        <button id="theme-toggle-btn" class="header-btn" aria-label="${t('settings_theme')}">
          ${getThemeIconSvg(getTheme())}
        </button>
      </div>
    </header>
  `;
}

export function initHeaderEvents() {
  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    toggleTheme();
    updateThemeIcon();
  });
  document.getElementById('lang-toggle-btn')?.addEventListener('click', () => {
    toggleLang();
  });
}
