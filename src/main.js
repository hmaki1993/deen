/**
 * دين (Deen) - Main Application Entry
 * Premium Islamic App
 */

import './style.css';
import { route, initRouter, setCleanup } from './router.js';
import { initTheme } from './components/theme-toggle.js';
import { renderHeader, initHeaderEvents } from './components/header.js';
import { renderNavbar } from './components/navbar.js';
import { getParentalLock } from './utils/storage.js';

// Pages
import { render as renderHome, cleanup as cleanupHome } from './pages/home.js';
import { render as renderQuranList } from './pages/quran-list.js';
import { render as renderQuranReader, cleanup as cleanupQuranReader } from './pages/quran-reader.js';
import { render as renderMushafReader, cleanup as cleanupMushafReader } from './pages/mushaf-reader.js';
import { render as renderAzkarList } from './pages/azkar-list.js';
import { render as renderAzkarView } from './pages/azkar-view.js';
import { render as renderPrayer } from './pages/prayer.js';
import { render as renderQibla, cleanup as cleanupQibla } from './pages/qibla.js';

/**
 * Initialize the application
 */
function initApp() {
  // Initialize theme
  initTheme();
  
  const app = document.getElementById('app');
  
  // Create app structure
  app.innerHTML = `
    ${renderHeader()}
    <main id="page-container"></main>
    ${renderNavbar()}
  `;
  
  // Initialize header events
  initHeaderEvents();
  
  // Get page container
  const pageContainer = document.getElementById('page-container');
  
  // Register routes
  route('/', (container) => {
    renderHome(container);
    setCleanup(cleanupHome);
  });
  
  route('/quran', (container) => {
    renderQuranList(container);
  });
  
  route('/quran/:id', (container, params) => {
    renderMushafReader(container, parseInt(params.id));
    setCleanup(cleanupMushafReader);
  });
  
  route('/quran/:id/read', (container, params) => {
    renderQuranReader(container, parseInt(params.id));
    setCleanup(cleanupQuranReader);
  });
  
  route('/quran/:id/memorize', (container, params) => {
    renderQuranReader(container, parseInt(params.id), null, true);
    setCleanup(cleanupQuranReader);
  });
  
  route('/quran/:id/:ayah', (container, params) => {
    renderMushafReader(container, parseInt(params.id), parseInt(params.ayah));
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
  });
  
  route('/qibla', (container) => {
    renderQibla(container);
    setCleanup(cleanupQibla);
  });
  
  // Enforce Parental Lock Routing
  const parentalLock = getParentalLock();
  if (parentalLock) {
    location.hash = `#/quran/${parentalLock.surahNumber}`;
  }

  // Initialize router
  initRouter(pageContainer);
  
  // Re-render on language change (full re-render for i18n)
  window.addEventListener('langchange', () => {
    // Re-render header and navbar
    const header = document.querySelector('.app-header');
    if (header) {
      header.outerHTML = renderHeader();
      initHeaderEvents();
    }
    
    const navbar = document.querySelector('.bottom-nav');
    if (navbar) {
      navbar.outerHTML = renderNavbar();
    }
    
    // Re-trigger current route
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  
  // Re-render navbar on hash change to update active tab
  window.addEventListener('hashchange', () => {
    const navbar = document.querySelector('.bottom-nav');
    if (navbar) {
      navbar.outerHTML = renderNavbar();
    }
  });
}

// Boot the app
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
