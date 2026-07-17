/**
 * ════════════════════════════════════════════
 *  دين (Deen) — Theme Toggle Module
 * ════════════════════════════════════════════
 *  Manages dark/light theme state. Persists
 *  to localStorage, respects OS preference on
 *  first visit, and dispatches a custom
 *  'themechange' event for other modules.
 * ════════════════════════════════════════════
 */

/**
 * Get the current active theme
 * @returns {'dark'|'light'}
 */
export function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

/**
 * Apply a theme and persist the choice
 * @param {'dark'|'light'} theme
 */
export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('deen-theme', theme);

  // Notify listeners (e.g. header icon update)
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

/**
 * Toggle between dark ↔ light
 */
export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

/**
 * Initialize theme on app startup.
 * Priority: localStorage → OS preference → dark (default)
 */
export function initTheme() {
  const saved = localStorage.getItem('deen-theme');

  if (saved) {
    setTheme(saved);
  } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    setTheme('light');
  } else {
    setTheme('dark');
  }
}
