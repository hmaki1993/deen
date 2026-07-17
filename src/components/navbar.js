/**
 * ════════════════════════════════════════════
 *  دين (Deen) — Bottom Navigation Bar
 * ════════════════════════════════════════════
 *  Fixed bottom nav with four tabs:
 *  Home · Quran · Azkar · Prayer
 *  Highlights the active route automatically.
 * ════════════════════════════════════════════
 */

import { t } from '../i18n/index.js';

// ── Tab definitions ────────────────────────

const tabs = [
  { id: 'home',   hash: '#/',       icon: '🏠', labelKey: 'nav_home' },
  { id: 'quran',  hash: '#/quran',  icon: '📖', labelKey: 'nav_quran' },
  { id: 'azkar',  hash: '#/azkar',  icon: '📿', labelKey: 'nav_azkar' },
  { id: 'prayer', hash: '#/prayer', icon: '🕌', labelKey: 'nav_prayer' },
];

// ── Helpers ────────────────────────────────

/**
 * Determine which tab is active based on the current URL hash
 * @returns {string} Active tab id
 */
function getActiveTab() {
  const hash = window.location.hash || '#/';

  if (hash === '#/' || hash === '') return 'home';
  if (hash.startsWith('#/quran'))  return 'quran';
  if (hash.startsWith('#/azkar'))  return 'azkar';
  if (hash.startsWith('#/prayer') || hash.startsWith('#/qibla')) return 'prayer';

  return 'home';
}

// ── Render ─────────────────────────────────

/**
 * Render the bottom navigation bar HTML
 * @returns {string} Navbar markup
 */
export function renderNavbar() {
  const active = getActiveTab();

  return `
    <nav class="bottom-nav">
      ${tabs.map(tab => `
        <a href="${tab.hash}" class="nav-tab ${active === tab.id ? 'active' : ''}" id="nav-${tab.id}" title="${t(tab.labelKey)}">
          <span class="nav-icon">${tab.icon}</span>
          <span class="nav-label">${t(tab.labelKey)}</span>
        </a>
      `).join('')}
    </nav>
  `;
}
