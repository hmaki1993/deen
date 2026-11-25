/**
 * دين (Deen) — Main Application Entry
 */

import './fonts.css';
import './style.css';
import { route, initRouter, setCleanup } from './router.js';
import { initTheme } from './components/theme-toggle.js';
import { renderHeader, initHeaderEvents } from './components/header.js';
import { renderNavbar, updateNavbarActive } from './components/navbar.js';
import { closeReciterModal } from './components/reciter-modal.js';
import { getParentalLock } from './utils/storage.js';
import { syncPrayerNotificationsIfEnabled } from './api/prayer.js';

// Pages
import { render as renderHome, cleanup as cleanupHome } from './pages/home.js';
import { render as renderQuranList, cleanup as cleanupQuranList } from './pages/quran-list.js';
import { render as renderQuranReader, cleanup as cleanupQuranReader } from './pages/quran-reader.js';
import { render as renderMushafReader, cleanup as cleanupMushafReader } from './pages/mushaf-reader.js';
import { render as renderAzkarList } from './pages/azkar-list.js';
import { render as renderAzkarView } from './pages/azkar-view.js';
import { render as renderPrayer, cleanup as cleanupPrayer } from './pages/prayer.js';
import { render as renderQibla, cleanup as cleanupQibla } from './pages/qibla.js';

function parseSurahId(raw) {
  const num = parseInt(raw, 10);
  if (!Number.isFinite(num) || num < 1 || num > 114) return 1;
  return num;
}

function parseAyahId(raw) {
  const num = parseInt(raw, 10);
  if (!Number.isFinite(num) || num < 1) return null;
  return num;
}

/**
 * Global Android hardware Back button handler invoked from MainActivity.java.
 * Returns true if back was consumed internally; false lets Android minimize the app.
 */
window.__deenHandleBack = function () {
  // 1. Close open PIN modal
  const pinOverlay = document.getElementById('pin-modal-overlay');
  if (pinOverlay && pinOverlay.classList.contains('active')) {
    document.getElementById('pin-cancel-btn')?.click();
    return true;
  }

  // 2. Close open Reciter modal
  const reciterModal = document.getElementById('reciter-modal');
  if (reciterModal && !reciterModal.classList.contains('hidden')) {
    closeReciterModal();
    return true;
  }

  // 3. Close open Audio Settings drawer
  const audioSettings = document.getElementById('audio-settings-card');
  if (audioSettings && !audioSettings.classList.contains('hidden')) {
    audioSettings.classList.add('hidden');
    return true;
  }

  // 4. Close open Ayah context menu
  const ctxMenu = document.getElementById('ayah-context-menu');
  if (ctxMenu && !ctxMenu.classList.contains('hidden')) {
    document.getElementById('ctx-backdrop')?.click();
    return true;
  }

  // 5. Respect Parental Lock when inside reader
  if (getParentalLock()) {
    document.getElementById('quran-back-btn')?.click();
    return true;
  }

  // 6. Navigate cleanly up hierarchy
  const hash = window.location.hash || '#/';
  if (/^#\/quran\/\d+/.test(hash)) {
    window.location.hash = '#/quran';
    return true;
  }
  if (/^#\/azkar\/.+/.test(hash)) {
    window.location.hash = '#/azkar';
    return true;
  }
  if (hash.startsWith('#/qibla')) {
    window.location.hash = '#/prayer';
    return true;
  }
  if (hash !== '#/' && hash !== '') {
    window.location.hash = '#/';
    return true;
  }

  // On Home screen -> allow Android to move app to background
  return false;
};

function initApp() {
  initTheme();

  const app = document.getElementById('app');
  app.innerHTML = `
    ${renderHeader()}
    <main id="page-container"></main>
    ${renderNavbar()}
  `;

  initHeaderEvents();

  const pageContainer = document.getElementById('page-container');

  route('/', (container) => {
    renderHome(container);
    setCleanup(cleanupHome);
  });

  route('/quran', (container) => {
    renderQuranList(container);
    setCleanup(cleanupQuranList);
  });

  route('/quran/:id', (container, params) => {
    renderMushafReader(container, parseSurahId(params.id));
    setCleanup(cleanupMushafReader);
  });

  route('/quran/:id/read', (container, params) => {
    renderQuranReader(container, parseSurahId(params.id));
    setCleanup(cleanupQuranReader);
  });

  route('/quran/:id/memorize', (container, params) => {
    renderQuranReader(container, parseSurahId(params.id), null, true);
    setCleanup(cleanupQuranReader);
  });

  route('/quran/:id/:ayah', (container, params) => {
    renderMushafReader(container, parseSurahId(params.id), parseAyahId(params.ayah));
    setCleanup(cleanupMushafReader);
  });

  route('/azkar', (container) => {
    renderAzkarList(container);
  });

  route('/azkar/:category', (container, params) => {
    renderAzkarView(container, params.category);
  });

  route('/prayer', (container) => {
    renderPrayer(container);
    setCleanup(cleanupPrayer);
  });

  route('/qibla', (container) => {
    renderQibla(container);
    setCleanup(cleanupQibla);
  });

  // Enforce Parental Lock initial route
  const parentalLock = getParentalLock();
  if (parentalLock) {
    window.location.hash = `#/quran/${parentalLock.surahNumber}`;
  }

  initRouter(pageContainer);

  // Re-render header, navbar, and active route on language change
  window.addEventListener('langchange', () => {
    const header = document.querySelector('.app-header');
    if (header) {
      header.outerHTML = renderHeader();
      initHeaderEvents();
    }

    const navbar = document.querySelector('.bottom-nav');
    if (navbar) {
      navbar.outerHTML = renderNavbar();
    }

    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

  // Lightweight active tab toggle (zero DOM rebuild on route change!)
  window.addEventListener('hashchange', updateNavbarActive);

  // Refresh rolling 7-day local prayer & azkar alarms in background if enabled
  setTimeout(() => {
    syncPrayerNotificationsIfEnabled();
  }, 1800);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
