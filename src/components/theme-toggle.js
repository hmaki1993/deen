/**
 * دين (Deen) — Theme Toggle Module
 * Single source of truth for dark/light theme + meta theme-color sync.
 */

import { Capacitor } from '@capacitor/core';

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

export function setTheme(theme) {
  const valid = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', valid);
  try {
    localStorage.setItem('deen-theme', valid);
  } catch {
    // Ignore
  }

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', valid === 'light' ? '#F5F2EB' : '#0A0A0F');
  }

  // Sync Android native statusBarColor & navigationBarColor + icon contrast immediately!
  if (Capacitor.isNativePlatform() && Capacitor?.Plugins?.DeenSystem) {
    Capacitor.Plugins.DeenSystem.setSystemTheme({ theme: valid }).catch(() => {});
  }

  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: valid } }));
}

export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

export function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem('deen-theme');
  } catch {
    // Ignore
  }

  if (saved === 'light' || saved === 'dark') {
    setTheme(saved);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    setTheme('light');
  } else {
    setTheme('dark');
  }
}
