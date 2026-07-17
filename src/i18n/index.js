/**
 * i18n — Internationalization Manager
 * Handles Arabic/English language switching with localStorage persistence
 * and reactive updates via CustomEvent dispatch.
 */

import ar from './ar.js';
import en from './en.js';

/** Available translation dictionaries */
const translations = { ar, en };

/** Current language (default: Arabic) */
let currentLang = localStorage.getItem('deen-lang') || 'ar';

/**
 * Apply language settings to the document root element.
 * Sets lang attribute, text direction (RTL/LTR), and data-lang attribute.
 * @param {string} lang - Language code ('ar' or 'en')
 */
function applyLang(lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('data-lang', lang);
}

// Initialize language on module load
applyLang(currentLang);

/**
 * Translate a key to the current language.
 * Falls back to Arabic, then returns the raw key if not found.
 * @param {string} key - Translation key
 * @returns {string} Translated string
 */
export function t(key) {
  return translations[currentLang]?.[key] || translations['ar']?.[key] || key;
}

/**
 * Get the current language code.
 * @returns {string} Current language ('ar' or 'en')
 */
export function getLang() {
  return currentLang;
}

/**
 * Set the active language and persist to localStorage.
 * Dispatches a 'langchange' CustomEvent for reactive UI updates.
 * @param {string} lang - Language code ('ar' or 'en')
 */
export function setLang(lang) {
  if (lang !== 'ar' && lang !== 'en') return;
  currentLang = lang;
  localStorage.setItem('deen-lang', lang);
  applyLang(lang);
  // Dispatch event for reactive updates across the app
  window.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

/**
 * Toggle between Arabic and English.
 */
export function toggleLang() {
  setLang(currentLang === 'ar' ? 'en' : 'ar');
}
