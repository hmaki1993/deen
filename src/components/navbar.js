/**
 * دين (Deen) — Bottom Navigation Bar
 * Clean inline SVG icons + readable labels + in-place active state updates (no outerHTML thrash).
 */

import { t } from '../i18n/index.js';

const tabs = [
  {
    id: 'home',
    hash: '#/',
    labelKey: 'nav_home',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M9 21v-6h6v6"/></svg>`,
  },
  {
    id: 'quran',
    hash: '#/quran',
    labelKey: 'nav_quran',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h7a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-7a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h8z"/></svg>`,
  },
  {
    id: 'azkar',
    hash: '#/azkar',
    labelKey: 'nav_azkar',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="4" r="1.5" fill="currentColor"/><circle cx="18.9" cy="8" r="1.5" fill="currentColor"/><circle cx="18.9" cy="16" r="1.5" fill="currentColor"/><circle cx="12" cy="20" r="1.5" fill="currentColor"/><circle cx="5.1" cy="16" r="1.5" fill="currentColor"/><circle cx="5.1" cy="8" r="1.5" fill="currentColor"/></svg>`,
  },
  {
    id: 'prayer',
    hash: '#/prayer',
    labelKey: 'nav_prayer',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>`,
  },
];

function getActiveTab() {
  const hash = window.location.hash || '#/';
  if (hash === '#/' || hash === '') return 'home';
  if (hash.startsWith('#/quran')) return 'quran';
  if (hash.startsWith('#/azkar')) return 'azkar';
  if (hash.startsWith('#/prayer') || hash.startsWith('#/qibla')) return 'prayer';
  return 'home';
}

export function renderNavbar() {
  const active = getActiveTab();
  return `
    <nav class="bottom-nav" aria-label="Main Navigation">
      ${tabs
        .map(
          (tab) => `
        <a href="${tab.hash}" class="nav-tab ${active === tab.id ? 'active' : ''}" id="nav-${tab.id}" data-tab="${tab.id}" title="${t(tab.labelKey)}">
          <span class="nav-icon">${tab.icon}</span>
          <span class="nav-label">${t(tab.labelKey)}</span>
        </a>
      `
        )
        .join('')}
    </nav>
  `;
}

/**
 * Lightweight active-class update without destroying/recreating the navbar DOM.
 */
export function updateNavbarActive() {
  const active = getActiveTab();
  const nav = document.querySelector('.bottom-nav');
  if (!nav) return;
  nav.style.display = '';
  nav.querySelectorAll('.nav-tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === active);
  });
}
